import type { Tape } from '../types/tape';
import type { Story } from '../types/story';
import { evaluateJsonPath } from '../utils/jsonpath';

export interface PlaybackState {
  persistentValues: Record<string, unknown>;
}

/**
 * Compute stateAfterStep[i] for each step index.
 * When tape has persistentStateByStep (from __BONDTRACE_ENV__ logs), use it directly.
 * Otherwise fall back to extracting from response bodies via story.persistentFields.
 */
export function computeStateAfterSteps(
  tape: Tape,
  story: Story
): PlaybackState[] {
  const n = tape.steps.length;
  if (n === 0) return [];

  // Use recorded env state when collection logs __BONDTRACE_ENV__ before each request
  if (tape.persistentStateByStep && tape.persistentStateByStep.length >= n) {
    return tape.persistentStateByStep.slice(0, n).map((state) => ({
      persistentValues: { ...state },
    }));
  }

  // Fallback: extract from response bodies using persistentFields
  const result: PlaybackState[] = [];
  let state: Record<string, unknown> = {};

  for (let i = 0; i < n; i++) {
    const step = tape.steps[i];
    const responseBody =
      typeof step.response.body === 'string'
        ? (() => {
            try {
              return JSON.parse(step.response.body);
            } catch {
              return null;
            }
          })()
        : step.response.body;

    for (const field of story.persistentFields) {
      let path = field.jsonPath;
      if (!path.startsWith('$')) {
        path = path.replace(/^response\.body\.?/, '$.');
        if (!path.startsWith('$')) path = '$.' + path;
      }
      const value = evaluateJsonPath(responseBody, path);
      if (value !== undefined && value !== null) {
        state = { ...state, [field.key]: value };
      }
    }

    result.push({ persistentValues: { ...state } });
  }

  return result;
}
