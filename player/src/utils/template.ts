import { evaluateJsonPath } from './jsonpath';

export interface TemplateContext {
  responseBody?: unknown;
  persistentValues?: Record<string, unknown>;
}

/**
 * Template syntax:
 * - {{response.body.id}}, {{response.body.status}} - from response body
 * - {{state.customerId}}, {{state.fieldName}} - from persistent values
 * Missing paths resolve to blank.
 */
export function renderTemplate(
  template: string,
  context: TemplateContext | unknown
): string {
  const isContext =
    context != null &&
    typeof context === 'object' &&
    !Array.isArray(context) &&
    ('responseBody' in (context as object) || 'persistentValues' in (context as object));
  const ctx: TemplateContext = isContext
    ? (context as TemplateContext)
    : { responseBody: context };

  const { responseBody, persistentValues = {} } = ctx;

  return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
    const trimmed = path.trim();
    if (!trimmed) return '';

    const parts = trimmed.split('.');
    if (parts[0] === 'state' && parts.length >= 2) {
      const key = parts.slice(1).join('.');
      const value = persistentValues[key];
      return value !== undefined && value !== null ? String(value) : '';
    }

    if (parts[0] === 'response' && parts[1] === 'body' && responseBody != null) {
      const jsonPath = toJsonPath(trimmed);
      const value = evaluateJsonPath(responseBody, jsonPath);
      return value !== undefined && value !== null ? String(value) : '';
    }

    return '';
  });
}

/**
 * Convert template path like "response.body.id" to JSONPath like "$.id"
 * since we're resolving against the response body directly.
 */
function toJsonPath(path: string): string {
  const parts = path.split('.');
  if (parts[0] === 'response' && parts[1] === 'body') {
    parts.shift();
    parts.shift();
  }
  if (parts.length === 0) return '$';
  return '$.' + parts.join('.');
}
