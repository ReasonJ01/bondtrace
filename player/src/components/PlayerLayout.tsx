import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { Tape } from '../types/tape';
import type { Story } from '../types/story';
import { useTheme } from '../context/ThemeContext';

function getVerbColor(method: string): string {
  const m = method.toUpperCase();
  if (m === 'GET') return '#22c55e';
  if (m === 'POST') return '#3b82f6';
  if (m === 'PUT' || m === 'PATCH') return '#f97316';
  if (m === 'DELETE') return '#ef4444';
  return 'var(--text-primary)';
}
import { Timeline } from './Timeline';
import { StepDetail } from './StepDetail';
import { StatePanel } from './StatePanel';
import { CurationPanel } from './CurationPanel';
import { computeStateAfterSteps } from '../engine/playback';

interface PlayerLayoutProps {
  tape: Tape;
  story: Story;
  onStoryChange: (story: Story) => void;
  onStoryLoad: (story: Story) => void;
  onReset: () => void;
}

export function PlayerLayout({ tape, story, onStoryChange, onStoryLoad, onReset }: PlayerLayoutProps) {
  const { theme, setTheme } = useTheme();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [phase, setPhase] = useState<'pre' | 'post'>('pre');
  const [isSending, setIsSending] = useState(false);
  const [showCuration, setShowCuration] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showRawBody, setShowRawBody] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const storyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setShowHeaderMenu(false);
      }
    };
    if (showHeaderMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showHeaderMenu]);

  const storyByStepId = useMemo(() => {
    const map = new Map<string, (typeof story.steps)[0]>();
    story.steps.forEach((s) => map.set(s.stepId, s));
    return map;
  }, [story.steps]);

  const visibleSteps = useMemo(() => {
    return tape.steps
      .map((step, index) => ({ step, index }))
      .filter(({ step }) => {
        const s = storyByStepId.get(step.id);
        return s?.visible !== false;
      });
  }, [tape.steps, storyByStepId]);

  const stateAfterSteps = useMemo(
    () => computeStateAfterSteps(tape, story),
    [tape, story]
  );

  const allPersistentKeys = useMemo(() => {
    const keys = new Set<string>();
    stateAfterSteps.forEach((s) => Object.keys(s.persistentValues).forEach((k) => keys.add(k)));
    return Array.from(keys).sort();
  }, [stateAfterSteps]);

  const visibleIndex = visibleSteps.findIndex((v) => v.index === currentStepIndex);
  const totalPositions = Math.max(1, visibleSteps.length * 2);
  const currentPosition = visibleIndex >= 0 ? visibleIndex * 2 + (phase === 'post' ? 1 : 0) : 0;
  const clampedPosition = Math.min(currentPosition, totalPositions - 1);
  const effectiveVisibleIndex = Math.floor(clampedPosition / 2);
  const effectivePhase = clampedPosition % 2 === 0 ? ('pre' as const) : ('post' as const);
  const effectiveStepIndex = visibleSteps[effectiveVisibleIndex]?.index ?? 0;
  const currentTapeStep = tape.steps[effectiveStepIndex];
  const currentStoryStep = currentTapeStep ? storyByStepId.get(currentTapeStep.id) : undefined;

  const currentState =
    effectivePhase === 'pre' || isSending
      ? (effectiveStepIndex > 0 ? stateAfterSteps[effectiveStepIndex - 1] : { persistentValues: {} })
      : (stateAfterSteps[effectiveStepIndex] ?? { persistentValues: {} });

  const canGoNext = clampedPosition < totalPositions - 1;
  const canGoPrev = clampedPosition > 0;

  const goNext = useCallback(() => {
    if (!canGoNext) return;
    if (phase === 'pre') {
      setPhase('post');
      setIsSending(true);
      setTimeout(() => setIsSending(false), 400);
    } else {
      const nextVisibleIndex = visibleIndex + 1;
      if (nextVisibleIndex < visibleSteps.length) {
        setCurrentStepIndex(visibleSteps[nextVisibleIndex].index);
        setPhase('pre');
      }
    }
  }, [canGoNext, phase, visibleIndex, visibleSteps]);

  const goPrev = useCallback(() => {
    if (!canGoPrev) return;
    if (phase === 'post') {
      setIsSending(false);
      setPhase('pre');
    } else {
      const prevVisibleIndex = visibleIndex - 1;
      if (prevVisibleIndex >= 0) {
        setCurrentStepIndex(visibleSteps[prevVisibleIndex].index);
        setPhase('post');
      }
    }
  }, [canGoPrev, phase, visibleIndex, visibleSteps]);

  const handleStepSelect = (tapeIndex: number) => {
    if (visibleSteps.some((v) => v.index === tapeIndex)) {
      setCurrentStepIndex(tapeIndex);
      setPhase('pre');
    }
  };

  useEffect(() => {
    if (visibleIndex < 0 && visibleSteps.length > 0) {
      const nearest = visibleSteps.find((v) => v.index >= currentStepIndex) ?? visibleSteps[visibleSteps.length - 1];
      setCurrentStepIndex(nearest.index);
    }
  }, [visibleSteps, visibleIndex, currentStepIndex]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === ' ') {
        e.preventDefault();
        setShowRawBody((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev]);

  const toggleStepVisibility = (stepId: string) => {
    onStoryChange({
      ...story,
      steps: story.steps.map((s) =>
        s.stepId === stepId ? { ...s, visible: !s.visible } : s
      ),
    });
  };

  const handleStoryFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const json = JSON.parse(reader.result as string);
          if (json?.steps && Array.isArray(json.steps)) {
            onStoryLoad(json as Story);
            setShowHeaderMenu(false);
          } else {
            alert('Invalid story file: missing steps array');
          }
        } catch {
          alert('Invalid JSON file');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [onStoryLoad]
  );

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      <aside
        style={{
          width: 280,
          minWidth: 280,
          background: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '10px 12px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontWeight: 500, fontSize: 'var(--font-size-base)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }}>
            {tape.collectionName}
          </span>
          <div ref={headerMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
            <input
              ref={storyInputRef}
              type="file"
              accept=".json"
              onChange={handleStoryFile}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => setShowHeaderMenu(!showHeaderMenu)}
              title="Actions"
              style={{
                padding: '4px 8px',
                fontSize: 'var(--font-size-sm)',
                fontFamily: 'inherit',
                cursor: 'pointer',
                background: showHeaderMenu ? 'var(--bg-tertiary)' : 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
              }}
            >
              ⋮
            </button>
            {showHeaderMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 4,
                  minWidth: 140,
                  padding: 4,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  zIndex: 100,
                }}
              >
                <button
                  onClick={() => {
                    setTheme(theme === 'dark' ? 'light' : 'dark');
                    setShowHeaderMenu(false);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: 'var(--font-size-sm)',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    border: 'none',
                    borderRadius: 4,
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  {theme === 'dark' ? '☀️ Light mode' : '🌙 Dark mode'}
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(story, null, 2)], {
                      type: 'application/json',
                    });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = 'story.json';
                    a.click();
                    URL.revokeObjectURL(a.href);
                    setShowHeaderMenu(false);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: 'var(--font-size-sm)',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    border: 'none',
                    borderRadius: 4,
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  Download story
                </button>
                <button
                  onClick={() => {
                    onReset();
                    setShowHeaderMenu(false);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: 'var(--font-size-sm)',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    border: 'none',
                    borderRadius: 4,
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  Reset
                </button>
              </div>
            )}
          </div>
        </div>
        <div style={{ flex: '0 0 auto', minHeight: 0, maxHeight: '50%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Timeline
            tape={tape}
            story={story}
            currentStepIndex={effectiveStepIndex}
            onStepSelect={handleStepSelect}
            onToggleVisibility={toggleStepVisibility}
            onStoryChange={onStoryChange}
          />
        </div>
        <div style={{ borderTop: '1px solid var(--border)', flex: '1 1 0', minHeight: 0, overflow: 'auto' }}>
          <StatePanel
            persistentValues={currentState.persistentValues}
            previousPersistentValues={
              effectiveStepIndex > 0 ? stateAfterSteps[effectiveStepIndex - 1]?.persistentValues ?? {} : {}
            }
            allPersistentKeys={allPersistentKeys}
            excludedPersistentKeys={story.excludedPersistentKeys}
            onExcludedKeysChange={(keys) => onStoryChange({ ...story, excludedPersistentKeys: keys })}
          />
        </div>
      </aside>

      <main
        style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-primary)',
          position: 'relative',
        }}
      >
        <div style={{ flex: 1, overflow: 'auto' }}>
          <StepDetail
            tapeStep={currentTapeStep}
            storyStep={currentStoryStep}
            templatePre={currentTapeStep ? (story.templatesPre ?? {})[currentTapeStep.id] : undefined}
            templatePost={currentTapeStep ? story.templates[currentTapeStep.id] : undefined}
            persistentValues={currentState.persistentValues}
            phase={effectivePhase}
            isSending={isSending}
            showRawBody={showRawBody}
            onShowRawBodyChange={setShowRawBody}
          />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
            background: 'var(--bg-primary)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 12,
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-muted)',
            }}
          >
            <span title="Previous / Next step">
              <kbd style={{ padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: 4, border: '1px solid var(--border)' }}>←</kbd>
              {' '}
              <kbd style={{ padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: 4, border: '1px solid var(--border)' }}>→</kbd>
            </span>
            <span title="Show / hide request or response body">
              <kbd style={{ padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: 4, border: '1px solid var(--border)' }}>Space</kbd>
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={goPrev}
            disabled={!canGoPrev}
            style={{
              padding: '8px 14px',
              fontSize: 'var(--font-size-base)',
              fontFamily: 'inherit',
              cursor: canGoPrev ? 'pointer' : 'not-allowed',
              background: canGoPrev ? 'var(--bg-tertiary)' : 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              opacity: canGoPrev ? 1 : 0.5,
            }}
          >
            Previous
          </button>
          <button
            onClick={goNext}
            disabled={!canGoNext}
            style={{
              padding: '8px 14px',
              fontSize: 'var(--font-size-base)',
              fontFamily: 'inherit',
              cursor: canGoNext ? 'pointer' : 'not-allowed',
              background:
                canGoNext && effectivePhase === 'pre'
                  ? getVerbColor(currentTapeStep?.request?.method ?? 'GET')
                  : canGoNext
                    ? 'var(--text-primary)'
                    : 'var(--bg-tertiary)',
              color: canGoNext ? 'var(--bg-primary)' : 'var(--text-muted)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              opacity: canGoNext ? 1 : 0.5,
            }}
          >
            {effectivePhase === 'pre'
              ? (currentTapeStep?.request?.method ?? 'GET').toUpperCase()
              : 'Next'}
          </button>
          </div>
        </div>
        <div style={{ background: 'var(--bg-tertiary)' }}>
          {!showCuration && (
          <div style={{ padding: '4px 12px', display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={() => setShowCuration(true)}
              title="Edit step title and narrative"
              style={{
                padding: '2px 6px',
                border: 'none',
                borderRadius: 4,
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: 'inherit',
                color: 'var(--text-muted)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-secondary)';
                e.currentTarget.style.background = 'var(--bg-elevated)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted)';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              Edit Step
            </button>
          </div>
          )}
        </div>

        {showCuration && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '75vh',
              background: 'var(--bg-tertiary)',
              borderTop: '1px solid var(--border)',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.4)',
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'var(--bg-tertiary)',
                borderBottom: '1px solid var(--border)',
                flexShrink: 0,
              }}
            >
              <span style={{ fontWeight: 500, fontSize: 'var(--font-size-xs)', color: 'var(--text-primary)' }}>
                Edit Step
              </span>
              <button
                onClick={() => setShowCuration(false)}
                title="Close"
                style={{
                  width: 28,
                  height: 28,
                  padding: 0,
                  border: 'none',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)',
                  fontSize: 18,
                  lineHeight: 1,
                  cursor: 'pointer',
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-elevated)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-tertiary)';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <CurationPanel
                tape={tape}
                story={story}
                currentStepId={currentTapeStep?.id}
                onStoryChange={onStoryChange}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
