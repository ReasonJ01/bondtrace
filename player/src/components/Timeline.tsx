import { useRef, useEffect, useState, useLayoutEffect } from 'react';
import type { Tape } from '../types/tape';
import type { Story } from '../types/story';

function getVerbColor(method: string): string {
  const m = method.toUpperCase();
  if (m === 'GET') return '#22c55e';
  if (m === 'POST') return '#3b82f6';
  if (m === 'PUT' || m === 'PATCH') return '#f97316';
  if (m === 'DELETE') return '#ef4444';
  return 'var(--text-primary)';
}

interface TimelineProps {
  tape: Tape;
  story: Story;
  currentStepIndex: number;
  onStepSelect: (index: number) => void;
  onToggleVisibility: (stepId: string) => void;
  onStoryChange: (story: Story) => void;
}

const DOT_SIZE = 10;
const TRACK_WIDTH = 20;
const LINE_WIDTH = 2;

export function Timeline({
  tape,
  story,
  currentStepIndex,
  onStepSelect,
  onToggleVisibility,
  onStoryChange,
}: TimelineProps) {
  const storyByStepId = new Map(story.steps.map((s) => [s.stepId, s]));

  const visibleSteps = tape.steps
    .map((step, index) => ({ step, tapeIndex: index }))
    .filter(({ step }) => storyByStepId.get(step.id)?.visible !== false);

  const [showManageSteps, setShowManageSteps] = useState(false);
  const [isHoveringSteps, setIsHoveringSteps] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const dotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [maxHeightPx, setMaxHeightPx] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight * 0.5 : 500
  );
  const [measuredContentHeight, setMeasuredContentHeight] = useState(0);
  const [gradientStop, setGradientStop] = useState<number | null>(null);
  const [lineTop, setLineTop] = useState<number | null>(null);
  const [lineHeight, setLineHeight] = useState<number | null>(null);

  const updateLineGradient = () => {
    const content = contentRef.current;
    if (!content || visibleSteps.length < 2) return;

    const firstDot = dotRefs.current[0];
    const lastDot = dotRefs.current[visibleSteps.length - 1];
    const visibleCurrentIndex = visibleSteps.findIndex((v) => v.tapeIndex === currentStepIndex);
    const currentDot = dotRefs.current[Math.max(0, visibleCurrentIndex)] ?? firstDot;

    if (!firstDot || !lastDot || !currentDot) return;

    const contentRect = content.getBoundingClientRect();
    const firstRect = firstDot.getBoundingClientRect();
    const lastRect = lastDot.getBoundingClientRect();
    const currentRect = currentDot.getBoundingClientRect();

    const firstCenter = firstRect.top - contentRect.top + firstRect.height / 2;
    const lastCenter = lastRect.top - contentRect.top + lastRect.height / 2;
    const currentCenter = currentRect.top - contentRect.top + currentRect.height / 2;

    setLineTop(firstCenter);
    setLineHeight(Math.max(0, lastCenter - firstCenter));

    const lineLen = lastCenter - firstCenter;
    if (lineLen <= 0) return;
    const whiteEndPx = currentCenter - firstCenter;
    const whiteEnd = Math.max(0, Math.min(1, whiteEndPx / lineLen));
    setGradientStop(whiteEnd * 100);
  };

  useLayoutEffect(() => {
    if (visibleSteps.length < 2) {
      setLineTop(null);
      setLineHeight(null);
      return;
    }
    updateLineGradient();
  }, [visibleSteps.length, currentStepIndex]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const ro = new ResizeObserver(() => {
      updateLineGradient();
      setMeasuredContentHeight(content.scrollHeight);
    });
    ro.observe(content);
    setMeasuredContentHeight(content.scrollHeight);
    return () => ro.disconnect();
  }, [visibleSteps.length]);

  useEffect(() => {
    const updateMaxHeight = () => setMaxHeightPx(window.innerHeight * 0.5);
    updateMaxHeight();
    window.addEventListener('resize', updateMaxHeight);
    return () => window.removeEventListener('resize', updateMaxHeight);
  }, []);

  const updateScrollFade = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 0);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollToActive = () => {
      const active = activeRef.current;
      if (!active) return;
      const containerRect = el.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const scrollTop = el.scrollTop;
      const activeTopInContent = activeRect.top - containerRect.top + scrollTop;
      const scrollTarget = activeTopInContent - containerRect.height / 2 + activeRect.height / 2;
      el.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
    };
    requestAnimationFrame(scrollToActive);
  }, [currentStepIndex]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollFade();
    el.addEventListener('scroll', updateScrollFade);
    const ro = new ResizeObserver(updateScrollFade);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollFade);
      ro.disconnect();
    };
  }, [visibleSteps.length]);

  const stepsContentHeight = visibleSteps.length > 0 ? visibleSteps.length * 32 + 24 : 0;
  const managePanelHeight = showManageSteps ? 240 : 0;
  const estimatedContentHeight = stepsContentHeight + managePanelHeight;
  const totalContentHeight =
    measuredContentHeight > 0 ? measuredContentHeight + managePanelHeight : estimatedContentHeight;
  const needsScroll = totalContentHeight > maxHeightPx;

  return (
    <div
      style={{
        flex: visibleSteps.length > 0 ? '0 0 auto' : 1,
        height: visibleSteps.length > 0 ? `min(${totalContentHeight}px, 50vh)` : undefined,
        minHeight: visibleSteps.length === 0 ? 80 : undefined,
        display: 'flex',
        flexDirection: 'column',
        borderBottom: '1px solid var(--border)',
        position: 'relative',
      }}
      onMouseEnter={() => setIsHoveringSteps(true)}
      onMouseLeave={() => setIsHoveringSteps(false)}
    >
      {!showManageSteps && (isHoveringSteps || visibleSteps.length === 0) && (
        <button
          onClick={() => setShowManageSteps(true)}
          title="Manage steps"
          style={{
            position: 'absolute',
            top: 8,
            right: 20,
            padding: 4,
            fontSize: 12,
            fontFamily: 'inherit',
            cursor: 'pointer',
            background: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            zIndex: 10,
          }}
        >
          👁
        </button>
      )}
      {showManageSteps && (
        <button
          onClick={() => setShowManageSteps(false)}
          title="Close"
          style={{
            position: 'absolute',
            top: 8,
            right: 20,
            padding: '4px 8px',
            fontSize: 'var(--font-size-xs)',
            fontFamily: 'inherit',
            cursor: 'pointer',
            background: 'transparent',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            zIndex: 10,
          }}
        >
          ×
        </button>
      )}
      {showManageSteps && (
        <div
          style={{
            padding: '12px 12px 16px',
            maxHeight: 200,
            overflow: 'auto',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <button
              onClick={() => {
                const allVisible = story.steps.every((s) => s.visible !== false);
                onStoryChange({
                  ...story,
                  steps: story.steps.map((s) => ({ ...s, visible: !allVisible })),
                });
              }}
              style={{
                padding: '4px 8px',
                fontSize: 'var(--font-size-xs)',
                fontFamily: 'inherit',
                cursor: 'pointer',
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 4,
              }}
            >
              Toggle all
            </button>
          </div>
          {tape.steps.map((step) => {
            const storyStep = storyByStepId.get(step.id);
            const visible = storyStep?.visible !== false;
            return (
              <label
                key={step.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--text-secondary)',
                }}
              >
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={() => onToggleVisibility(step.id)}
                  style={{ accentColor: 'var(--timeline-active)' }}
                />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {storyStep?.title ?? step.name}
                </span>
              </label>
            );
          })}
        </div>
      )}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
      <div
        style={{
          flex: 1,
          position: 'relative',
          minHeight: 0,
        }}
      >
        <div
          ref={scrollRef}
          style={{
            position: 'absolute',
            inset: 0,
            overflowY: needsScroll ? 'auto' : 'hidden',
            overflowX: 'hidden',
            padding: '0 12px 0 0',
          }}
        >
          <div ref={contentRef} style={{ padding: '12px 0', position: 'relative' }}>
          {/* Vertical line: spans full content height */}
          {visibleSteps.length > 1 && lineTop != null && lineHeight != null && (
            <div
              ref={lineRef}
              style={{
                position: 'absolute',
                left: TRACK_WIDTH / 2 - LINE_WIDTH / 2,
                top: lineTop,
                height: lineHeight,
                width: LINE_WIDTH,
                zIndex: 0,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: visibleSteps.length > 1 && gradientStop != null ? `${gradientStop}%` : '0%',
                  background: 'var(--timeline-completed)',
                  transition: 'height 0.35s ease-out',
                }}
              />
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  background: 'var(--timeline-future)',
                }}
              />
            </div>
          )}

          <div style={{ position: 'relative', zIndex: 1 }}>
            {visibleSteps.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
                  No steps visible.
                </span>
                <button
                  onClick={() => setShowManageSteps(true)}
                  style={{
                    padding: '6px 12px',
                    fontSize: 'var(--font-size-xs)',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                  }}
                >
                  Manage steps
                </button>
              </div>
            ) : (
            visibleSteps.map(({ step, tapeIndex }, visibleIndex) => {
              const storyStep = storyByStepId.get(step.id);
              const isCurrent = tapeIndex === currentStepIndex;
              const isCompleted = visibleIndex < visibleSteps.findIndex((v) => v.tapeIndex === currentStepIndex);
              const verbColor = getVerbColor(step.request?.method ?? 'GET');

              return (
                <div
                  key={step.id}
                  ref={isCurrent ? activeRef : null}
                  className="timeline-step-row"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0,
                    marginBottom: 4,
                    minHeight: 28,
                  }}
                >
                  {/* Track: dot centered in row */}
                  <div
                    style={{
                      width: TRACK_WIDTH,
                      flexShrink: 0,
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      position: 'relative',
                    }}
                  >
                    {/* Mask circle: hides the line through the center of future (hollow) dots */}
                    {!isCurrent && !isCompleted && (
                      <div
                        style={{
                          position: 'absolute',
                          left: '50%',
                          top: '50%',
                          transform: 'translate(-50%, -50%)',
                          width: DOT_SIZE - LINE_WIDTH * 2,
                          height: DOT_SIZE - LINE_WIDTH * 2,
                          borderRadius: '50%',
                          background: 'var(--bg-secondary)',
                          pointerEvents: 'none',
                        }}
                      />
                    )}
                    <div
                      ref={(el) => {
                        dotRefs.current[visibleIndex] = el;
                      }}
                      className={isCurrent ? 'timeline-dot timeline-dot-active' : 'timeline-dot'}
                      style={{
                        width: DOT_SIZE,
                        height: DOT_SIZE,
                        borderRadius: '50%',
                        background: isCurrent
                          ? verbColor
                          : isCompleted
                            ? 'var(--timeline-completed)'
                            : 'transparent',
                        border: isCurrent || isCompleted
                          ? 'none'
                          : `${LINE_WIDTH}px solid var(--timeline-future)`,
                        boxShadow: isCurrent ? `0 0 0 2px ${verbColor}40` : 'none',
                        ...(isCurrent && { '--timeline-active-dot': verbColor } as React.CSSProperties),
                        position: 'relative',
                        zIndex: 1,
                      }}
                    />
                  </div>

                  {/* Step content */}
                  <button
                    onClick={() => onStepSelect(tapeIndex)}
                    className="timeline-step-button"
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      padding: '6px 8px',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      background: isCurrent ? `${verbColor}14` : 'transparent',
                      fontWeight: isCurrent ? 500 : 400,
                      fontSize: 'var(--font-size-sm)',
                      fontFamily: 'inherit',
                      color: isCurrent ? 'var(--text-primary)' : isCompleted ? 'var(--timeline-completed-text)' : 'var(--timeline-future-text)',
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        overflow: 'hidden',
                        wordBreak: 'break-word',
                        whiteSpace: 'normal',
                      }}
                    >
                      {storyStep?.title ?? step.name}
                    </span>
                  </button>
                </div>
              );
            })
            )}
          </div>
        </div>
        </div>
        {canScrollUp && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 12,
              height: 48,
              background: 'linear-gradient(to bottom, var(--bg-secondary) 0%, color-mix(in srgb, var(--bg-secondary) 90%, transparent) 20%, color-mix(in srgb, var(--bg-secondary) 50%, transparent) 45%, color-mix(in srgb, var(--bg-secondary) 10%, transparent) 75%, transparent 100%)',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />
        )}
        {canScrollDown && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 12,
              height: 48,
              background: 'linear-gradient(to top, var(--bg-secondary) 0%, color-mix(in srgb, var(--bg-secondary) 90%, transparent) 20%, color-mix(in srgb, var(--bg-secondary) 50%, transparent) 45%, color-mix(in srgb, var(--bg-secondary) 10%, transparent) 75%, transparent 100%)',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />
        )}
      </div>
      </div>
    </div>
  );
}
