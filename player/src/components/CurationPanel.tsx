import { useMemo } from 'react';
import type { Tape } from '../types/tape';
import type { Story, StoryStep } from '../types/story';
import { renderTemplate } from '../utils/template';
import { computeStateAfterSteps } from '../engine/playback';
import { TemplateTextarea } from './TemplateTextarea';

interface CurationPanelProps {
  tape: Tape;
  story: Story;
  currentStepId: string | undefined;
  onStoryChange: (story: Story) => void;
}

export function CurationPanel({
  tape,
  story,
  currentStepId,
  onStoryChange,
}: CurationPanelProps) {
  const currentStep = tape.steps.find((s) => s.id === currentStepId);
  const currentStoryStep = currentStepId
    ? story.steps.find((s) => s.stepId === currentStepId)
    : undefined;
  const currentTemplatePre = currentStepId ? (story.templatesPre ?? {})[currentStepId] ?? '' : '';
  const currentTemplatePost = currentStepId ? story.templates[currentStepId] ?? '' : '';
  const stateAfterSteps = useMemo(() => computeStateAfterSteps(tape, story), [tape, story]);
  const currentStepIndex = currentStepId ? tape.steps.findIndex((s) => s.id === currentStepId) : -1;
  const persistentValuesBefore =
    currentStepIndex > 0 ? stateAfterSteps[currentStepIndex - 1]?.persistentValues ?? {} : {};
  const persistentValuesAfter =
    currentStepIndex >= 0 ? stateAfterSteps[currentStepIndex]?.persistentValues ?? {} : {};
  const responseBody =
    currentStep && typeof currentStep.response.body === 'object'
      ? currentStep.response.body
      : currentStep && typeof currentStep.response.body === 'string'
        ? (() => {
            try {
              return JSON.parse(currentStep.response.body);
            } catch {
              return null;
            }
          })()
        : null;

  const updateStep = (stepId: string, updater: (s: StoryStep) => StoryStep) => {
    onStoryChange({
      ...story,
      steps: story.steps.map((s) => (s.stepId === stepId ? updater(s) : s)),
    });
  };

  const updateTemplatePre = (stepId: string, value: string) => {
    const next = { ...(story.templatesPre ?? {}) };
    if (value) next[stepId] = value;
    else delete next[stepId];
    onStoryChange({ ...story, templatesPre: next });
  };

  const updateTemplatePost = (stepId: string, value: string) => {
    const next = { ...story.templates };
    if (value) next[stepId] = value;
    else delete next[stepId];
    onStoryChange({ ...story, templates: next });
  };

  const persistentFieldKeys = useMemo(() => {
    const keys = new Set<string>();
    stateAfterSteps.forEach((s) => Object.keys(s.persistentValues).forEach((k) => keys.add(k)));
    return Array.from(keys);
  }, [stateAfterSteps]);

  const inputStyle = {
    width: '100%' as const,
    padding: 6,
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 'var(--font-size-sm)',
    fontFamily: 'inherit' as const,
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
  };

  return (
    <div style={{ padding: 12, borderTop: '1px solid var(--border)', fontSize: 'var(--font-size-sm)' }}>
      {!currentStepId ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>Select a step to edit</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>
              Title
            </label>
            <input
              value={currentStoryStep?.title ?? currentStep?.name ?? ''}
              onChange={(e) => updateStep(currentStepId, (s) => ({ ...s, title: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>
              Pre-request narrative (type {'{{'} to see suggestions)
            </label>
            <TemplateTextarea
              value={currentTemplatePre}
              onChange={(v) => updateTemplatePre(currentStepId, v)}
              rows={3}
              placeholder="Using {{state.customerId}} from previous step..."
              style={inputStyle}
              persistentFieldKeys={persistentFieldKeys}
              responseBody={null}
              isPreTemplate={true}
            />
            {currentTemplatePre && (
              <div
                style={{
                  marginTop: 8,
                  padding: 10,
                  background: 'var(--bg-tertiary)',
                  borderRadius: 6,
                  fontSize: 'var(--font-size-sm)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>Preview</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  {renderTemplate(currentTemplatePre, { persistentValues: persistentValuesBefore }) || '(empty)'}
                </div>
              </div>
            )}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>
              Post-request narrative (type {'{{'} to see suggestions)
            </label>
            <TemplateTextarea
              value={currentTemplatePost}
              onChange={(v) => updateTemplatePost(currentStepId, v)}
              rows={3}
              placeholder="Customer {{response.body.id}} created with status {{response.body.status}}."
              style={inputStyle}
              persistentFieldKeys={persistentFieldKeys}
              responseBody={responseBody}
              isPreTemplate={false}
            />
            {currentTemplatePost && (responseBody || Object.keys(persistentValuesAfter).length > 0) && (
              <div
              style={{
                marginTop: 8,
                padding: 10,
                background: 'var(--bg-tertiary)',
                borderRadius: 6,
                fontSize: 'var(--font-size-sm)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>Preview</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  {renderTemplate(currentTemplatePost, {
                    responseBody,
                    persistentValues: persistentValuesAfter,
                  }) || '(empty)'}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
