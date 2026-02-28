/**
 * Newman tape reporter - captures request/response data and writes tape.json
 */

import type { Tape, TapeStep, TapeRequest, TapeResponse } from './tape-schema.js';
import { BONDTRACE_ENV_PREFIX } from './tape-schema.js';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';

interface ReporterOptions {
  export?: string;
}

interface HeadersLike {
  toObject?: (enabled?: boolean, ignoreCase?: boolean) => Record<string, string>;
  each?: (cb: (header: { key: string; value: string }) => void) => void;
  all?: () => Array<{ key: string; value: string }>;
}

interface RequestLike {
  method?: string;
  url?: { toString: () => string } | string;
  headers?: HeadersLike;
  body?: { toString?: () => string; raw?: string };
  getHeaders?: (opts?: object) => Record<string, string>;
}

interface ResponseLike {
  code?: number;
  headers?: HeadersLike;
  body?: string;
  stream?: Buffer | ArrayBuffer;
  text?: () => string;
  getHeaders?: (opts?: object) => Record<string, string>;
}

function headersToObject(headers: HeadersLike | undefined): Record<string, string> {
  if (!headers) return {};
  if (typeof headers.toObject === 'function') {
    const obj = headers.toObject(true, false);
    return obj && typeof obj === 'object' ? obj : {};
  }
  const obj: Record<string, string> = {};
  if (headers.all) {
    for (const h of headers.all()) {
      if (h?.key != null && h?.value !== undefined) obj[h.key] = String(h.value);
    }
  } else if (headers.each) {
    headers.each((h: { key: string; value: string }) => {
      if (h?.key != null && h?.value !== undefined) obj[h.key] = String(h.value);
    });
  }
  return obj;
}

function extractRequest(req: RequestLike): TapeRequest {
  const url = typeof req.url === 'string' ? req.url : req.url?.toString?.() ?? '';
  const headers = req.getHeaders ? req.getHeaders({}) : headersToObject(req.headers);
  const body = req.body?.raw ?? req.body?.toString?.() ?? null;
  return {
    method: req.method || 'GET',
    url,
    headers: headers && typeof headers === 'object' ? headers : {},
    body,
  };
}

function extractResponse(res: ResponseLike): TapeResponse {
  let body: string | object = '';
  try {
    if (typeof res.text === 'function') {
      body = res.text();
    }
    if ((body === undefined || body === '') && res.body != null) body = res.body;
    if ((body === undefined || body === '') && res.stream != null && typeof Buffer !== 'undefined') {
      body = (res.stream as Buffer).toString('utf-8');
    }
  } catch {
    body = res.body ?? '';
  }
  body = body ?? '';
  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        body = JSON.parse(trimmed);
      } catch {
        // keep as string
      }
    }
  }
  const headers = res.getHeaders ? res.getHeaders({}) : headersToObject(res.headers);
  return {
    statusCode: res.code ?? 0,
    headers: headers && typeof headers === 'object' ? headers : {},
    body,
  };
}

function tryParseEnvLog(msg: unknown): Record<string, unknown> | null {
  const s = typeof msg === 'string' ? msg : String(msg ?? '');
  const idx = s.indexOf(BONDTRACE_ENV_PREFIX);
  if (idx < 0) return null;
  try {
    const json = s.slice(idx + BONDTRACE_ENV_PREFIX.length).trim();
    const obj = JSON.parse(json);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  } catch {
    return null;
  }
}

export function createTapeReporter(options: ReporterOptions = {}) {
  const outputPath = options.export || 'tape.json';
  const steps: TapeStep[] = [];
  const envByPosition: Record<number, Record<string, unknown>> = {};
  let collectionName = '';
  let folderName = '';
  let stepIndex = 0;

  return {
    init: (collection: { name?: string }, folder?: { name?: string }) => {
      collectionName = collection?.name ?? 'Unknown';
      folderName = folder?.name ?? 'Root';
    },

    onConsole: (args: { cursor?: { position?: number }; messages?: unknown[] }) => {
      const pos = args.cursor?.position;
      if (pos == null || !Array.isArray(args.messages)) return;
      for (const msg of args.messages) {
        const env = tryParseEnvLog(msg);
        if (env) {
          envByPosition[pos] = env;
          break;
        }
      }
    },

    onRequest: (
      err: Error | null,
      args: {
        item?: { name?: string; id?: string };
        request?: RequestLike;
        response?: ResponseLike;
      }
    ) => {
      if (err || !args.request || !args.response) return;

      const item = args.item;
      const step: TapeStep = {
        id: item?.id ?? randomUUID(),
        index: stepIndex++,
        name: item?.name ?? `Step ${stepIndex}`,
        request: extractRequest(args.request),
        response: extractResponse(args.response),
      };
      steps.push(step);
    },

    write: (summary?: { environment?: { toObject?: (excludeDisabled?: boolean, caseSensitive?: boolean) => Record<string, unknown> } }) => {
      let variableExports: Tape['variableExports'];
      let persistentStateByStep: Tape['persistentStateByStep'];
      const env = summary?.environment;
      if (env?.toObject) {
        try {
          const obj = env.toObject(true, false);
          if (obj && typeof obj === 'object') {
            variableExports = Object.entries(obj)
              .filter(([, v]) => v !== undefined && v !== null)
              .map(([key, value]) => ({ key, value }));
          }
        } catch {
          /* ignore */
        }
      }

      // Build persistentStateByStep from __BONDTRACE_ENV__ logs: env at position N+1 = state after step N
      const n = steps.length;
      if (n > 0 && Object.keys(envByPosition).length > 0) {
        let finalEnv: Record<string, unknown> = {};
        try {
          const obj = env?.toObject?.(true, false);
          if (obj && typeof obj === 'object') finalEnv = obj;
        } catch {
          /* ignore */
        }
        if (Object.keys(finalEnv).length === 0 && envByPosition[n]) finalEnv = envByPosition[n];
        persistentStateByStep = [];
        for (let i = 0; i < n; i++) {
          persistentStateByStep.push(envByPosition[i + 1] ?? (i === n - 1 ? finalEnv : {}));
        }
      }

      const tape: Tape = {
        version: '1.0',
        recordedAt: new Date().toISOString(),
        collectionName,
        folderName,
        steps,
        ...(variableExports && variableExports.length > 0 ? { variableExports } : {}),
        ...(persistentStateByStep && persistentStateByStep.length > 0 ? { persistentStateByStep } : {}),
      };
      const outPath = resolve(process.cwd(), outputPath);
      writeFileSync(outPath, JSON.stringify(tape, null, 2), 'utf-8');
      return outPath;
    },

    getSteps: () => steps,
  };
}
