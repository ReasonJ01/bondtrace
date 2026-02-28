import { JSONPath } from 'jsonpath-plus';

/**
 * Evaluate a JSONPath against data.
 * Returns undefined if path not found or invalid.
 */
export function evaluateJsonPath(
  data: unknown,
  path: string
): unknown {
  if (data == null) return undefined;
  try {
    const results = JSONPath({ path, json: data });
    return results?.length ? results[0] : undefined;
  } catch {
    return undefined;
  }
}
