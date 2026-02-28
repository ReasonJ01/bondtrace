import { useState, useEffect } from 'react';
import type { TapeStep } from '../types/tape';
import type { StoryStep } from '../types/story';
import { renderTemplate } from '../utils/template';
import { JsonCodeBlock } from './JsonCodeBlock';

function getVerbColor(method: string): string {
  const m = method.toUpperCase();
  if (m === 'GET') return '#22c55e';
  if (m === 'POST') return '#3b82f6';
  if (m === 'PUT' || m === 'PATCH') return '#f97316';
  if (m === 'DELETE') return '#ef4444';
  return 'var(--text-primary)';
}

function getStatusColor(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 300) return '#22c55e';
  if (statusCode >= 300 && statusCode < 400) return '#3b82f6';
  if (statusCode >= 400 && statusCode < 500) return '#f97316';
  if (statusCode >= 500) return '#ef4444';
  return 'var(--text-muted)';
}


interface StepDetailProps {
  tapeStep: TapeStep | undefined;
  storyStep: StoryStep | undefined;
  templatePre?: string;
  templatePost?: string;
  persistentValues?: Record<string, unknown>;
  phase: 'pre' | 'post';
  isSending?: boolean;
  showRawBody?: boolean;
  onShowRawBodyChange?: (show: boolean) => void;
}

export function StepDetail({
  tapeStep,
  storyStep,
  templatePre,
  templatePost,
  persistentValues = {},
  phase,
  isSending = false,
  showRawBody = false,
  onShowRawBodyChange,
}: StepDetailProps) {
  const isPre = phase === 'pre';
  const [localShowRawBody, setLocalShowRawBody] = useState(false);
  const showRawBodyControlled = onShowRawBodyChange !== undefined;
  const showRawBodyValue = showRawBodyControlled ? showRawBody : localShowRawBody;
  const setShowRawBodyValue = showRawBodyControlled
    ? (v: boolean) => onShowRawBodyChange!(v)
    : setLocalShowRawBody;
  const [sendingDots, setSendingDots] = useState(0);

  useEffect(() => {
    if (!isSending) {
      setSendingDots(0);
      return;
    }
    const id = setInterval(() => {
      setSendingDots((d) => (d + 1) % 3);
    }, 300);
    return () => clearInterval(id);
  }, [isSending]);

  if (!tapeStep) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
        }}
      >
        No step selected
      </div>
    );
  }

  const title = storyStep?.title ?? tapeStep.name;
  const responseBody =
    typeof tapeStep.response.body === 'string'
      ? (() => {
          try {
            return JSON.parse(tapeStep.response.body);
          } catch {
            return null;
          }
        })()
      : tapeStep.response.body;
  const responseBodyStr =
    typeof tapeStep.response.body === 'string'
      ? tapeStep.response.body
      : JSON.stringify(tapeStep.response.body, null, 2);
  const requestBody = tapeStep.request.body ?? '';

  const showPostContent = !isPre && !isSending;
  const activeTemplate = isPre ? templatePre : showPostContent ? templatePost : undefined;
  const templatedContent = activeTemplate
    ? renderTemplate(activeTemplate, {
        responseBody: isPre ? undefined : responseBody,
        persistentValues,
      })
    : null;

  return (
    <div className="step-detail-content" style={{ flex: 1, overflow: 'auto', padding: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 500 }}>{title}</h2>
      </div>

      <div
        className={isSending ? 'url-bar-sending' : undefined}
        style={{
          ...(isSending && { '--url-bar-sending-color': getVerbColor(tapeStep.request.method) } as React.CSSProperties),
          background:
            showPostContent
              ? `color-mix(in srgb, ${getStatusColor(tapeStep.response.statusCode)} 8%, var(--bg-tertiary))`
              : 'var(--bg-tertiary)',
          padding: '12px 16px',
          borderRadius: 6,
          fontSize: 'var(--font-size-base)',
          lineHeight: 1.5,
          marginBottom: 16,
          border: '1px solid var(--border)',
          display: 'grid',
          gridTemplateColumns: 'auto 1fr 60px',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ fontWeight: 500, color: getVerbColor(tapeStep.request.method), lineHeight: 1.5 }}>
          {tapeStep.request.method}
        </span>
        <span style={{ color: 'var(--text-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.5 }}>{tapeStep.request.url}</span>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            minHeight: 24,
            lineHeight: 1.5,
          }}
        >
          {isSending ? (
            <span
              className="sending-dots"
              style={{
                fontSize: 'var(--font-size-sm)',
                color: getVerbColor(tapeStep.request.method),
                lineHeight: 1.5,
                padding: '2px 8px',
                borderRadius: 4,
                display: 'inline-block',
                minWidth: 28,
                textAlign: 'center',
              }}
            >
              {'.'.repeat(sendingDots + 1)}
            </span>
          ) : showPostContent ? (
            <span
              style={{
                fontWeight: 600,
                fontSize: 'var(--font-size-sm)',
                color: getStatusColor(tapeStep.response.statusCode),
                padding: '2px 8px',
                borderRadius: 4,
                background: 'rgba(255,255,255,0.06)',
                lineHeight: 1.5,
                display: 'inline-block',
                minWidth: 28,
                textAlign: 'center',
              }}
            >
              {tapeStep.response.statusCode}
            </span>
          ) : (
            <span style={{ visibility: 'hidden', fontSize: 'var(--font-size-sm)', padding: '2px 8px', lineHeight: 1.5 }}>200</span>
          )}
        </span>
      </div>

      {templatedContent && (
        <div
          className="animate-fade-in-up"
          style={{
            padding: 16,
            background: 'var(--bg-tertiary)',
            borderRadius: 6,
            marginBottom: 16,
            border: '1px solid var(--border)',
            borderLeft: '3px solid var(--text-muted)',
          }}
        >
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--font-size-base)', color: 'var(--text-secondary)' }}>
            {templatedContent}
          </div>
        </div>
      )}

      {!isSending && (
        <div className="animate-fade-in" style={{ marginBottom: 16 }}>
          <button
            onClick={() => setShowRawBodyValue(!showRawBodyValue)}
            style={{
              padding: '8px 0',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 'var(--font-size-base)',
              fontFamily: 'inherit',
              fontWeight: 500,
              color: 'var(--text-secondary)',
            }}
          >
            {showRawBodyValue ? 'Hide' : 'Show'} {isPre ? 'request' : 'response'} body
          </button>
          {showRawBodyValue && isPre && (
            <JsonCodeBlock
              content={requestBody}
              language={requestBody.trim().startsWith('{') || requestBody.trim().startsWith('[') ? 'json' : 'plain'}
            />
          )}
          {showRawBodyValue && showPostContent && (
            <JsonCodeBlock
              content={responseBodyStr}
              language={responseBodyStr.trim().startsWith('{') || responseBodyStr.trim().startsWith('[') ? 'json' : 'plain'}
            />
          )}
        </div>
      )}
    </div>
  );
}
