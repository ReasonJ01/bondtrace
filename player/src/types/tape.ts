/**
 * Tape format - immutable full capture of a Newman/Postman run.
 */

export interface TapeRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

export interface TapeResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string | object;
}

export interface TapeStep {
  id: string;
  index: number;
  name: string;
  request: TapeRequest;
  response: TapeResponse;
}

export interface TapeVariableExport {
  key: string;
  value: unknown;
}

export interface Tape {
  version: string;
  recordedAt: string;
  collectionName: string;
  folderName: string;
  steps: TapeStep[];
  /** Environment variables captured at end of Newman run */
  variableExports?: TapeVariableExport[];
  /** Persistent state after each step (from __BONDTRACE_ENV__ logs) - used directly for playback */
  persistentStateByStep?: Record<string, unknown>[];
}
