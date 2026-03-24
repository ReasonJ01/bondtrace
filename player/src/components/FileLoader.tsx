import { useCallback, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { Tape } from '../types/tape';
import type { Story } from '../types/story';

function panelStyle(): CSSProperties {
  return {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 24,
  };
}

function buttonStyle(primary = false): CSSProperties {
  return {
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: primary ? 'var(--text-primary)' : 'var(--bg-elevated)',
    color: primary ? 'var(--bg-primary)' : 'var(--text-primary)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 'var(--font-size-sm)',
  };
}

interface FileLoaderProps {
  onTapeLoad: (tape: Tape) => void;
  onStoryLoad: (story: Story) => void;
  onBack?: () => void;
  hasTape: boolean;
  onContinueWithDefault?: () => void;
}

export function FileLoader({ onTapeLoad, onStoryLoad, onBack, hasTape, onContinueWithDefault }: FileLoaderProps) {
  const tapeInputRef = useRef<HTMLInputElement>(null);
  const storyInputRef = useRef<HTMLInputElement>(null);

  const handleTapeFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const json = JSON.parse(reader.result as string);
          if (json?.steps && Array.isArray(json.steps)) {
            onTapeLoad(json as Tape);
          } else {
            alert('Invalid tape file: missing steps array');
          }
        } catch {
          alert('Invalid JSON file');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [onTapeLoad]
  );

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
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--bg-primary)',
      }}
    >
      <div
        style={{
          ...panelStyle(),
          maxWidth: 520,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Load files
          </div>
          {onBack && (
            <button onClick={onBack} style={buttonStyle()}>
              Back
            </button>
          )}
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, lineHeight: 1.05 }}>
          Bondtrace
        </h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--font-size-base)' }}>
          Load a tape and optionally a story to begin playback.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            ref={tapeInputRef}
            type="file"
            accept=".json"
            onChange={handleTapeFile}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => tapeInputRef.current?.click()}
            style={buttonStyle(true)}
          >
            Load tape.json
          </button>
          <input
            ref={storyInputRef}
            type="file"
            accept=".json"
            onChange={handleStoryFile}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => storyInputRef.current?.click()}
            disabled={!hasTape}
            style={{
              ...buttonStyle(),
              cursor: hasTape ? 'pointer' : 'not-allowed',
              opacity: hasTape ? 1 : 0.45,
            }}
          >
            Load story.json (optional)
          </button>
        </div>
        {hasTape && (
          <>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Tape loaded. Load a story or continue with default.
            </p>
            {onContinueWithDefault && (
              <button onClick={onContinueWithDefault} style={buttonStyle()}>
                Continue with default story
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
