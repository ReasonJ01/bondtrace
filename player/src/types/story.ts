/**
 * Story format - curation config for tape playback.
 * References tape by path; stepId links to tape steps.
 */

import type { Tape } from './tape';

/** Build persistent fields from tape variableExports (env vars set during Newman run) */
export function persistentFieldsFromTape(tape: Tape): PersistentField[] {
  const exports = tape.variableExports;
  if (!exports?.length) return [];

  return exports.filter((e) => e.key).map((e) => ({ key: e.key, jsonPath: `$.${e.key}` }));
}

export interface StoryStep {
  stepId: string;
  visible: boolean;
  title: string;
}

export interface PersistentField {
  key: string;
  jsonPath: string;
}

export interface Story {
  version: string;
  tapePath: string;
  steps: StoryStep[];
  persistentFields: PersistentField[];
  templates: Record<string, string>;
  templatesPre?: Record<string, string>;
  /** Variable keys to hide from Persistent State panel (e.g. access_token) */
  excludedPersistentKeys?: string[];
}

export function createDefaultStory(tape: Tape): Story {
  return {
    version: '1.0',
    tapePath: '',
    steps: tape.steps.map((step) => ({
      stepId: step.id,
      visible: true,
      title: step.name,
    })),
    persistentFields: persistentFieldsFromTape(tape),
    templates: {},
    templatesPre: {},
  };
}
