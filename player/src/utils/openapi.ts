import SwaggerClient from 'swagger-client';
import type { FlowHeader, OpenApiImportResult, OpenApiOperation, OpenApiSecurityScheme } from '../types/flow-builder';

type AnyRecord = Record<string, any>;

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function makeHeader(name: string, value: string): FlowHeader {
  return {
    id: crypto.randomUUID(),
    name,
    value,
  };
}

function extractSecuritySchemes(spec: AnyRecord): OpenApiSecurityScheme[] {
  const schemes = spec?.components?.securitySchemes ?? {};
  return Object.entries(schemes).map(([name, value]) => ({
    name,
    type: String((value as AnyRecord)?.type ?? 'unknown'),
    scheme: typeof (value as AnyRecord)?.scheme === 'string' ? (value as AnyRecord).scheme : undefined,
    bearerFormat: typeof (value as AnyRecord)?.bearerFormat === 'string' ? (value as AnyRecord).bearerFormat : undefined,
  }));
}

function firstJsonContent(content: AnyRecord | undefined): { mediaType: string; value: AnyRecord } | null {
  if (!content || typeof content !== 'object') return null;
  const jsonEntry = Object.entries(content).find(([mediaType]) => mediaType.includes('json'));
  if (jsonEntry) {
    return { mediaType: jsonEntry[0], value: jsonEntry[1] as AnyRecord };
  }
  const firstEntry = Object.entries(content)[0];
  return firstEntry ? { mediaType: firstEntry[0], value: firstEntry[1] as AnyRecord } : null;
}

function resolveRef(spec: AnyRecord, ref: string): AnyRecord | undefined {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return undefined;
  const parts = ref.slice(2).split('/');
  let current: any = spec;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return typeof current === 'object' && current !== null ? current : undefined;
}

function exampleFromSchema(schema: AnyRecord | undefined, spec: AnyRecord, depth = 0): any {
  if (!schema || depth > 5) return undefined;
  const resolved = schema.$ref ? resolveRef(spec, schema.$ref) : schema;
  if (!resolved) return undefined;
  if (resolved.example !== undefined) return resolved.example;
  if (Array.isArray(resolved.enum) && resolved.enum.length > 0) return resolved.enum[0];
  if (resolved.default !== undefined) return resolved.default;
  if (Array.isArray(resolved.allOf) && resolved.allOf.length > 0) {
    const merged: Record<string, any> = {};
    for (const sub of resolved.allOf) {
      const subResolved = (sub as AnyRecord).$ref ? resolveRef(spec, (sub as AnyRecord).$ref) : sub;
      const subExample = exampleFromSchema(subResolved as AnyRecord, spec, depth + 1);
      if (typeof subExample === 'object' && subExample !== null && !Array.isArray(subExample)) {
        Object.assign(merged, subExample);
      }
    }
    return Object.keys(merged).length > 0 ? merged : undefined;
  }
  const oneOf = resolved.oneOf ?? resolved.anyOf;
  if (Array.isArray(oneOf) && oneOf.length > 0) {
    const first = oneOf[0] as AnyRecord;
    const firstResolved = first?.$ref ? resolveRef(spec, first.$ref) : first;
    return exampleFromSchema(firstResolved, spec, depth + 1);
  }
  if (resolved.type === 'object' || resolved.properties) {
    const properties = resolved.properties ?? {};
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(properties)) {
      const child = exampleFromSchema(value as AnyRecord, spec, depth + 1);
      result[key] = child !== undefined ? child : 'string';
    }
    return result;
  }
  if (resolved.type === 'array') {
    const child = exampleFromSchema(resolved.items, spec, depth + 1);
    return [child !== undefined ? child : 'string'];
  }
  if (resolved.type === 'integer' || resolved.type === 'number') return 0;
  if (resolved.type === 'boolean') return false;
  if (resolved.type === 'string') {
    if (resolved.format === 'uuid') return '{{$uuid}}';
    if (resolved.format === 'date-time' || resolved.format === 'date') return '2024-01-01T00:00:00Z';
    return '{{$random_string}}';
  }
  return '';
}

function extractRequestBody(operation: AnyRecord, spec: AnyRecord): { body: string; headers: FlowHeader[] } {
  let requestBody = operation?.requestBody;
  if (requestBody?.$ref) {
    const resolved = resolveRef(spec, requestBody.$ref);
    if (resolved) requestBody = resolved;
  }
  const contentEntry = firstJsonContent(requestBody?.content);
  if (!contentEntry) {
    return { body: '', headers: [] };
  }

  const contentValue = contentEntry.value;
  let schema = contentValue?.schema;
  if (schema?.$ref) {
    const resolved = resolveRef(spec, schema.$ref);
    if (resolved) schema = resolved;
  }
  const firstExample = contentValue?.examples ? Object.values(contentValue.examples)[0] as AnyRecord | undefined : undefined;
  const example =
    contentValue?.example ??
    firstExample?.value ??
    exampleFromSchema(schema, spec);

  return {
    body: example === undefined ? '' : JSON.stringify(example, null, 2),
    headers: [makeHeader('Content-Type', contentEntry.mediaType)],
  };
}

function operationSecurityNames(spec: AnyRecord, operation: AnyRecord): string[] {
  const security = operation.security ?? spec.security ?? [];
  if (!Array.isArray(security)) return [];
  const names = new Set<string>();
  for (const entry of security) {
    if (entry && typeof entry === 'object') {
      for (const key of Object.keys(entry)) names.add(key);
    }
  }
  return Array.from(names);
}

function buildOperation(serverUrl: string, path: string, method: string, operation: AnyRecord, spec: AnyRecord): OpenApiOperation {
  const requestBody = extractRequestBody(operation, spec);
  const title =
    (typeof operation.summary === 'string' && operation.summary.trim()) ||
    (typeof operation.operationId === 'string' && titleCase(operation.operationId)) ||
    `${method.toUpperCase()} ${path}`;

  return {
    id: typeof operation.operationId === 'string' && operation.operationId.trim()
      ? operation.operationId
      : `${method.toLowerCase()}_${path.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`,
    method: method.toUpperCase(),
    path,
    title,
    description: typeof operation.description === 'string' ? operation.description : undefined,
    defaultUrl: `${serverUrl}${decodeURI(path)}`,
    defaultBody: requestBody.body,
    defaultHeaders: requestBody.headers,
    securitySchemeNames: operationSecurityNames(spec, operation),
  };
}

export async function loadOpenApiDocument(text: string): Promise<OpenApiImportResult> {
  const blob = new Blob([text], { type: 'application/yaml' });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const resolved = await SwaggerClient.resolve({ url: objectUrl });
    const spec = (resolved?.spec ?? resolved) as AnyRecord;
    const servers = Array.isArray(spec?.servers)
      ? spec.servers.map((server: AnyRecord) => String(server?.url ?? '')).filter(Boolean)
      : [];
    const defaultServer = servers[0] ?? '';
    const operations: OpenApiOperation[] = [];
    const paths = spec?.paths ?? {};

    for (const [path, pathItem] of Object.entries(paths)) {
      const pathRecord = pathItem as AnyRecord;
      for (const method of ['get', 'post', 'put', 'patch', 'delete', 'options', 'head']) {
        if (!pathRecord?.[method]) continue;
        operations.push(buildOperation(defaultServer, path, method, pathRecord[method], spec));
      }
    }

    operations.sort((a, b) => a.title.localeCompare(b.title) || a.method.localeCompare(b.method) || a.path.localeCompare(b.path));

    return {
      title: typeof spec?.info?.title === 'string' ? spec.info.title : 'OpenAPI Flow',
      description: typeof spec?.info?.description === 'string' ? spec.info.description : undefined,
      servers,
      operations,
      securitySchemes: extractSecuritySchemes(spec),
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

