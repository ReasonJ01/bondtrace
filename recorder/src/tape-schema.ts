/**
 * Tape format - immutable full capture of a Newman/Postman run.
 * Step ID is the primary linkage between tape and story.
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

/** Environment variables set during the collection run (from pm.environment.set) */
export interface TapeVariableExport {
  key: string;
  value: unknown;
}

/** Prefix for collection scripts to log env for Bondtrace capture. Log before each request: console.log('__BONDTRACE_ENV__' + JSON.stringify(pm.environment.toObject())) */
export const BONDTRACE_ENV_PREFIX = '__BONDTRACE_ENV__';

export interface Tape {
  version: string;
  recordedAt: string;
  collectionName: string;
  folderName: string;
  steps: TapeStep[];
  /** Environment variable values captured at end of run */
  variableExports?: TapeVariableExport[];
  /** Persistent state after each step, from __BONDTRACE_ENV__ logs (when collection logs env before each request) */
  persistentStateByStep?: Record<string, unknown>[];
}
