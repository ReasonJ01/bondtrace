import { existsSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, extname, relative, resolve } from 'path';
import { randomInt, randomUUID } from 'crypto';
import { createServer } from 'http';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { execSync } from 'child_process';
import type { Tape, TapeRequest, TapeResponse, TapeStep } from './tape-schema.js';

const SUPPORTED_AUTH_VARS = ['client_token', 'ops_token'] as const;

interface DirectiveMap {
  name?: string;
  auth?: string;
  wait?: string;
  waitForContinue?: string;
  sets: Array<{ key: string; expression: string }>;
}

interface HttpRequestStep {
  type: 'request';
  id: string;
  name: string;
  auth?: string;
  method: string;
  url: string;
  headers: Array<{ name: string; value: string }>;
  body: string | null;
  sets: Array<{ key: string; expression: string }>;
}

interface HttpWaitStep {
  type: 'wait';
  seconds: number;
}

interface HttpWaitForContinueStep {
  type: 'waitForContinue';
  label: string;
}

type HttpFlowStep = HttpRequestStep | HttpWaitStep | HttpWaitForContinueStep;

interface ParsedHttpFlow {
  name: string;
  steps: HttpFlowStep[];
  warnings: string[];
}

interface ResponseContext {
  status: number;
  headers: Record<string, string>;
  body: string | object;
}

function loadHttpFile(inputPath: string): string {
  const stat = statSync(inputPath);
  if (!stat.isFile()) {
    throw new Error(`Expected a single .http file, received: ${inputPath}`);
  }

  if (extname(inputPath).toLowerCase() !== '.http') {
    throw new Error(`Expected a .http file, received: ${inputPath}`);
  }

  return inputPath;
}

function splitSegments(content: string): string[] {
  return content
    .split(/^\s*###\s*$/m)
    .map((segment) => segment.replace(/^\uFEFF/, '').trim())
    .filter((segment) => segment.length > 0);
}

function parseDirectives(lines: string[], sourceLabel: string, warnings: string[]): { directives: DirectiveMap; rest: string[] } {
  const directives: DirectiveMap = { sets: [] };
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.startsWith('@')) break;

    const match = /^@([a-z_]+)(?:\s+(.*))?$/.exec(line);
    if (!match) {
      throw new Error(`Invalid directive syntax in ${sourceLabel}: ${line}`);
    }

    const [, directive, rawValue = ''] = match;
    const value = rawValue.trim();

    switch (directive) {
      case 'name':
        directives.name = value;
        break;
      case 'auth':
        directives.auth = value;
        break;
      case 'set': {
        const eqIndex = value.indexOf('=');
        if (eqIndex < 1) {
          throw new Error(`Invalid @set directive in ${sourceLabel}: ${line}`);
        }
        directives.sets.push({
          key: value.slice(0, eqIndex).trim(),
          expression: value.slice(eqIndex + 1).trim(),
        });
        break;
      }
      case 'wait':
        directives.wait = value;
        break;
      case 'wait_for_continue':
        directives.waitForContinue = value;
        break;
      default:
        warnings.push(`Ignoring unknown directive ${line} in ${sourceLabel}`);
        break;
    }

    index += 1;
  }

  return { directives, rest: lines.slice(index) };
}

function findRequestLineIndex(lines: string[]): number {
  return lines.findIndex((line) => /^[A-Z]+\s+\S/.test(line));
}

function parseSegment(segment: string, sourceLabel: string, ordinal: number, warnings: string[]): HttpFlowStep {
  const lines = segment.split(/\r?\n/);
  const { directives, rest } = parseDirectives(lines, sourceLabel, warnings);
  const requestLineIndex = findRequestLineIndex(rest);

  if (directives.wait && directives.waitForContinue) {
    throw new Error(`Segment ${ordinal} in ${sourceLabel} cannot include both @wait and @wait_for_continue`);
  }

  if (directives.wait || directives.waitForContinue) {
    if (requestLineIndex >= 0) {
      throw new Error(`Segment ${ordinal} in ${sourceLabel} cannot mix wait directives with a request line`);
    }
    if (directives.auth || directives.sets.length > 0) {
      throw new Error(`Segment ${ordinal} in ${sourceLabel} cannot mix request directives with waits`);
    }

    if (directives.wait) {
      const seconds = Number(directives.wait);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        throw new Error(`Invalid @wait value in ${sourceLabel}: ${directives.wait}`);
      }
      return { type: 'wait', seconds };
    }

    return {
      type: 'waitForContinue',
      label: directives.waitForContinue && directives.waitForContinue.length > 0
        ? directives.waitForContinue
        : 'Continue',
    };
  }

  if (requestLineIndex < 0) {
    throw new Error(`Segment ${ordinal} in ${sourceLabel} is missing an HTTP request line`);
  }

  const requestLine = rest[requestLineIndex];
  const requestMatch = /^([A-Z]+)\s+(.+)$/.exec(requestLine);
  if (!requestMatch) {
    throw new Error(`Invalid request line in ${sourceLabel}: ${requestLine}`);
  }

  const [, method, url] = requestMatch;
  const afterRequest = rest.slice(requestLineIndex + 1);
  const blankIndex = afterRequest.findIndex((line) => line.trim() === '');
  const headerLines = blankIndex >= 0 ? afterRequest.slice(0, blankIndex) : afterRequest;
  const bodyLines = blankIndex >= 0 ? afterRequest.slice(blankIndex + 1) : [];

  const headers = headerLines.map((line) => {
    const colonIndex = line.indexOf(':');
    if (colonIndex < 1) {
      throw new Error(`Malformed header line in ${sourceLabel}: ${line}`);
    }
    return {
      name: line.slice(0, colonIndex).trim(),
      value: line.slice(colonIndex + 1).trim(),
    };
  });

  const body = bodyLines.length > 0 ? bodyLines.join('\n').replace(/\n+$/, '') : null;
  const id = directives.name || `step_${String(ordinal).padStart(3, '0')}`;

  return {
    type: 'request',
    id,
    name: directives.name || `${method} ${url}`,
    auth: directives.auth,
    method,
    url,
    headers,
    body,
    sets: directives.sets,
  };
}

export function parseHttpFlow(inputPath: string): ParsedHttpFlow {
  const resolvedInput = resolve(process.cwd(), inputPath);
  if (!existsSync(resolvedInput)) {
    throw new Error(`.http input not found: ${inputPath}`);
  }

  const filePath = loadHttpFile(resolvedInput);
  const warnings: string[] = [];
  const steps: HttpFlowStep[] = [];
  const seenIds = new Set<string>();
  let requestOrdinal = 1;
  const content = readFileSync(filePath, 'utf-8');
  const sourceLabel = relative(process.cwd(), filePath) || filePath;
  const segments = splitSegments(content);

  for (const segment of segments) {
    const parsed = parseSegment(segment, sourceLabel, requestOrdinal, warnings);
    if (parsed.type === 'request') {
      let nextId = parsed.id;
      if (seenIds.has(nextId)) {
        let suffix = 2;
        while (seenIds.has(`${parsed.id}_${suffix}`)) suffix += 1;
        nextId = `${parsed.id}_${suffix}`;
        warnings.push(`Duplicate @name "${parsed.id}" in ${sourceLabel}; renamed to "${nextId}"`);
      }
      parsed.id = nextId;
      seenIds.add(nextId);
      requestOrdinal += 1;
    }
    steps.push(parsed);
  }

  return {
    name: relative(process.cwd(), dirname(filePath)) || dirname(filePath),
    steps,
    warnings,
  };
}

export function loadEnvFile(envFilePath?: string): Record<string, string> {
  if (!envFilePath) return {};

  const resolvedPath = resolve(process.cwd(), envFilePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Env file not found: ${envFilePath}`);
  }

  const env: Record<string, string> = {};
  const lines = readFileSync(resolvedPath, 'utf-8').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex < 1) {
      throw new Error(`Invalid env line in ${envFilePath}: ${rawLine}`);
    }

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value.replace(/\$\{([^}]+)\}/g, (_match, name: string) => {
      const lookup = env[name] ?? process.env[name];
      return lookup ?? '';
    });
  }

  return env;
}

function randomString(length = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += chars[randomInt(0, chars.length)];
  }
  return result;
}

function getPathValue(source: unknown, path: string): unknown {
  if (!path) return source;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, source);
}

function resolveToken(
  token: string,
  vars: Record<string, unknown>,
  response?: ResponseContext,
  warnings?: string[]
): unknown {
  if (token === '$uuid') return randomUUID();
  if (token === '$random_string') return randomString();
  if (token === '$random_int') return randomInt(0, 1000000000);

  if (token.startsWith('vars.')) {
    return getPathValue(vars, token.slice('vars.'.length));
  }

  if (token.startsWith('response.') && response) {
    if (token === 'response.status') return response.status;
    if (token === 'response.body') return response.body;
    if (token.startsWith('response.body.')) {
      return getPathValue(response.body, token.slice('response.body.'.length));
    }
    if (token.startsWith('response.headers.')) {
      return response.headers[token.slice('response.headers.'.length).toLowerCase()];
    }
  }

  if (Object.prototype.hasOwnProperty.call(vars, token)) {
    return vars[token];
  }

  warnings?.push(`Unresolved interpolation token: {{${token}}}`);
  return undefined;
}

function renderValue(
  template: string,
  vars: Record<string, unknown>,
  response?: ResponseContext,
  warnings?: string[]
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, rawToken: string) => {
    const value = resolveToken(rawToken.trim(), vars, response, warnings);
    if (value === undefined || value === null) return match;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });
}

function evaluateSetExpression(
  expression: string,
  vars: Record<string, unknown>,
  response: ResponseContext,
  warnings: string[]
): unknown {
  const exactToken = /^\{\{([^}]+)\}\}$/.exec(expression.trim());
  if (exactToken) {
    const value = resolveToken(exactToken[1].trim(), vars, response, warnings);
    return value ?? null;
  }

  return renderValue(expression, vars, response, warnings);
}

function headersToObject(headers: Array<{ name: string; value: string }>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const header of headers) {
    result[header.name] = header.value;
  }
  return result;
}

function cloneVars(vars: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(vars));
}

async function waitForContinue(label: string): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    await rl.question(`${label} (press Enter to continue) `);
  } finally {
    rl.close();
  }
}

function tryParseJson(text: string): string | object {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return text;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return text;
  }
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  execSync(cmd, { stdio: 'ignore' });
}

async function fetchClientToken(env: Record<string, string>): Promise<string> {
  const tokenUrl = env.OAUTH_TOKEN_URL;
  const clientId = env.CLIENT_ID;
  const clientSecret = env.CLIENT_SECRET;
  if (!tokenUrl?.trim() || !clientId?.trim() || !clientSecret?.trim()) {
    throw new Error(
      'client_token requires OAUTH_TOKEN_URL, CLIENT_ID, and CLIENT_SECRET in .env'
    );
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Client credentials token request failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { access_token?: string };
  const token = data?.access_token;
  if (!token || typeof token !== 'string') {
    throw new Error('Client credentials response missing access_token');
  }
  return token;
}

async function fetchOpsToken(env: Record<string, string>): Promise<string> {
  const authorizeUrl = env.AUTHORIZE_URL;
  const clientId = env.BROWSER_CLIENT_ID;
  const redirectUri = env.REDIRECT_URI;
  if (!authorizeUrl?.trim() || !clientId?.trim() || !redirectUri?.trim()) {
    throw new Error(
      'ops_token requires AUTHORIZE_URL, BROWSER_CLIENT_ID, and REDIRECT_URI in .env'
    );
  }

  const url = new URL(authorizeUrl);
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', randomUUID());

  const parsedRedirect = new URL(redirectUri);
  const host = parsedRedirect.hostname || 'localhost';
  const port = parsedRedirect.port
    ? Number(parsedRedirect.port)
    : parsedRedirect.protocol === 'https:'
      ? 443
      : 80;
  const path = parsedRedirect.pathname || '/';

  return new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const reqUrl = new URL(req.url ?? '/', `http://${req.headers.host}`);
      if (req.method === 'POST' && reqUrl.pathname === '/capture') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { token } = JSON.parse(body) as { token?: string };
            if (token && typeof token === 'string') {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(
                '<html><body><p>Success! You can close this window.</p></body></html>'
              );
              server.close();
              resolve(token);
            } else {
              res.writeHead(400);
              res.end('Missing token');
              reject(new Error('Implicit flow: no token received'));
            }
          } catch {
            res.writeHead(400);
            res.end('Invalid request');
            reject(new Error('Implicit flow: invalid capture request'));
          }
        });
        return;
      }

      const requestPath = reqUrl.pathname || '/';
      const redirectPath = path === '' ? '/' : path;
      if (requestPath === redirectPath || requestPath === '/') {
        const html = `<!DOCTYPE html><html><head><title>Auth</title></head><body>
<script>
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  const err = params.get('error');
  if (err) {
    document.body.innerHTML = '<p>Auth error: ' + (params.get('error_description') || err) + '</p>';
  } else {
    const token = params.get('access_token');
    if (token) {
      fetch('/capture', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ token }) });
      document.body.innerHTML = '<p>Success! You can close this window.</p>';
    } else {
      document.body.innerHTML = '<p>No access_token in redirect. Check the URL fragment.</p>';
    }
  }
</script><p>Waiting for redirect...</p></body></html>`;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(Number(port), host, () => {
      openBrowser(url.toString());
    });

    server.on('error', (err) => {
      reject(new Error(`Implicit flow: could not start callback server: ${err.message}`));
    });
  });
}

async function ensureAuthTokens(
  usedAuthVars: Set<string>,
  env: Record<string, string>,
  runtimeVars: Record<string, unknown>
): Promise<void> {
  for (const authVar of usedAuthVars) {
    if (!SUPPORTED_AUTH_VARS.includes(authVar as (typeof SUPPORTED_AUTH_VARS)[number])) {
      continue;
    }
    const existing = runtimeVars[authVar];
    if (existing != null && String(existing).trim() !== '') {
      continue;
    }
    if (authVar === 'client_token') {
      runtimeVars.client_token = await fetchClientToken(env);
    } else if (authVar === 'ops_token') {
      runtimeVars.ops_token = await fetchOpsToken(env);
    }
  }
}

export async function executeHttpFlow(
  inputPath: string,
  outputPath: string,
  envFilePath?: string
): Promise<{
  tapePath: string;
  stepCount: number;
  warnings: string[];
  stepResults: Array<{ name: string; method: string; status: number; ok: boolean }>;
  failedStepDetails: Array<{
    name: string;
    method: string;
    url: string;
    requestBody: string;
    status: number;
    responseBody: string;
  }>;
  unsetVars: string[];
}> {
  const parsed = parseHttpFlow(inputPath);
  const envVars = loadEnvFile(envFilePath);
  const runtimeVars: Record<string, unknown> = { ...envVars };
  const warnings = [...parsed.warnings];
  const steps: TapeStep[] = [];
  const persistentStateByStep: Record<string, unknown>[] = [];

  const usedAuthVars = new Set<string>();
  for (const step of parsed.steps) {
    if (step.type === 'request' && step.auth) usedAuthVars.add(step.auth);
  }
  await ensureAuthTokens(usedAuthVars, envVars, runtimeVars);

  for (const step of parsed.steps) {
    if (step.type === 'wait') {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, step.seconds * 1000));
      continue;
    }

    if (step.type === 'waitForContinue') {
      await waitForContinue(step.label);
      continue;
    }

    const renderedHeaders = step.headers.map((header) => ({
      name: header.name,
      value: renderValue(header.value, runtimeVars, undefined, warnings),
    }));

    const hasAuthorizationHeader = renderedHeaders.some((header) => header.name.toLowerCase() === 'authorization');
    if (step.auth && !hasAuthorizationHeader) {
      const token = runtimeVars[step.auth];
      if (token == null || token === '') {
        throw new Error(`Missing auth variable "${step.auth}" for step "${step.id}"`);
      }
      renderedHeaders.push({
        name: 'Authorization',
        value: `Bearer ${String(token)}`,
      });
    }

    const request: TapeRequest = {
      method: step.method,
      url: renderValue(step.url, runtimeVars, undefined, warnings),
      headers: headersToObject(renderedHeaders),
      body: step.body == null ? null : renderValue(step.body, runtimeVars, undefined, warnings),
    };

    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body ?? undefined,
    });

    const responseText = await response.text();
    const responseHeaders = Object.fromEntries(
      Array.from(response.headers.entries()).map(([key, value]) => [key.toLowerCase(), value])
    );

    const responseContext: ResponseContext = {
      status: response.status,
      headers: responseHeaders,
      body: tryParseJson(responseText),
    };

    for (const setDirective of step.sets) {
      runtimeVars[setDirective.key] = evaluateSetExpression(
        setDirective.expression,
        runtimeVars,
        responseContext,
        warnings
      );
    }

    const tapeResponse: TapeResponse = {
      statusCode: responseContext.status,
      headers: responseHeaders,
      body: responseContext.body,
    };

    steps.push({
      id: step.id,
      index: steps.length,
      name: step.name,
      request,
      response: tapeResponse,
    });
    persistentStateByStep.push(cloneVars(runtimeVars));
  }

  const tape: Tape = {
    version: '1.0',
    recordedAt: new Date().toISOString(),
    collectionName: parsed.name,
    folderName: 'Root',
    steps,
    variableExports: Object.entries(runtimeVars).map(([key, value]) => ({ key, value })),
    persistentStateByStep,
  };

  const resolvedOutput = resolve(process.cwd(), outputPath);
  writeFileSync(resolvedOutput, JSON.stringify(tape, null, 2), 'utf-8');

  const stepResults = steps.map((s) => ({
    name: s.name,
    method: s.request.method,
    status: s.response.statusCode,
    ok: s.response.statusCode >= 200 && s.response.statusCode < 300,
  }));

  const failedStepDetails = steps
    .filter((s) => s.response.statusCode < 200 || s.response.statusCode >= 300)
    .map((s) => {
      const bodyStr =
        typeof s.response.body === 'string'
          ? s.response.body
          : typeof s.response.body === 'object'
            ? JSON.stringify(s.response.body)
            : String(s.response.body);
      const truncatedBody = bodyStr.length > 500 ? bodyStr.slice(0, 500) + '...[truncated]' : bodyStr;
      const reqBody = s.request.body ?? '';
      const truncatedReqBody = reqBody.length > 300 ? reqBody.slice(0, 300) + '...[truncated]' : reqBody;
      return {
        name: s.name,
        method: s.request.method,
        url: s.request.url,
        requestBody: truncatedReqBody,
        status: s.response.statusCode,
        responseBody: truncatedBody,
      };
    });

  const unsetVars = [...new Set(warnings.filter((w) => w.startsWith('Unresolved interpolation token:')).map((w) => w.replace(/^Unresolved interpolation token: \{\{([^}]+)\}\}$/, '$1')))].filter(Boolean);

  return {
    tapePath: resolvedOutput,
    stepCount: steps.length,
    warnings,
    stepResults,
    failedStepDetails,
    unsetVars,
  };
}

