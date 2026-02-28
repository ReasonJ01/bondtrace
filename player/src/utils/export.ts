import type { Tape, TapeStep } from '../types/tape';
import type { Story } from '../types/story';

const REDACTED_HEADERS = ['authorization', 'cookie', 'set-cookie'];

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    result[k] = REDACTED_HEADERS.includes(k.toLowerCase()) ? '[REDACTED]' : v;
  }
  return result;
}

export interface ExportOptions {
  redactAuth?: boolean;
  includeHiddenSteps?: boolean;
}

/**
 * Create a sanitized presentation bundle from tape + story.
 * Always redacts Authorization, Cookie, Set-Cookie headers.
 */
export function createPresentationBundle(
  tape: Tape,
  story: Story,
  options: ExportOptions = {}
): { tape: Tape; story: Story } {
  const { redactAuth = true, includeHiddenSteps = false } = options;
  const storyByStepId = new Map(story.steps.map((s) => [s.stepId, s]));

  const steps: TapeStep[] = tape.steps
    .filter((step) => includeHiddenSteps || storyByStepId.get(step.id)?.visible !== false)
    .map((step) => ({
      ...step,
      request: {
        ...step.request,
        headers: redactAuth ? redactHeaders(step.request.headers) : step.request.headers,
      },
      response: {
        ...step.response,
        headers: redactAuth ? redactHeaders(step.response.headers) : step.response.headers,
      },
    }));

  const redactedTape: Tape = { ...tape, steps };

  const visibleStepIds = new Set(story.steps.filter((s) => s.visible).map((s) => s.stepId));
  const redactedStory: Story = {
    ...story,
    steps: story.steps.filter((s) => includeHiddenSteps || visibleStepIds.has(s.stepId)),
  };

  return { tape: redactedTape, story: redactedStory };
}

export function createSingleFileHtml(tape: Tape, story: Story): string {
  const bundle = createPresentationBundle(tape, story);
  const json = JSON.stringify({ tape: bundle.tape, story: bundle.story });
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bondtrace Demo</title>
  <script>
    window.__BONDTRACE_BUNDLE__ = ${JSON.stringify(json)};
  </script>
</head>
<body>
  <div id="root"></div>
  <p>Load this file in the Bondtrace player with the bundled data.</p>
</body>
</html>`;
}
