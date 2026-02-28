import { useCallback, useRef } from 'react';
import type { Tape } from '../types/tape';
import type { Story } from '../types/story';

interface FileLoaderProps {
  onTapeLoad: (tape: Tape) => void;
  onStoryLoad: (story: Story) => void;
  hasTape: boolean;
  onContinueWithDefault?: () => void;
}

export function FileLoader({ onTapeLoad, onStoryLoad, hasTape, onContinueWithDefault }: FileLoaderProps) {
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
        gap: 24,
      }}
    >
      <h1 style={{ margin: 0, fontSize: 'var(--font-size-xl)', fontWeight: 500, letterSpacing: '-0.02em' }}>
        Bondtrace
      </h1>
      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--font-size-base)' }}>
        Load a tape and optionally a story to begin playback.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <input
          ref={tapeInputRef}
          type="file"
          accept=".json"
          onChange={handleTapeFile}
          style={{ display: 'none' }}
        />
        <button
          onClick={() => tapeInputRef.current?.click()}
          style={{
            padding: '10px 20px',
            fontSize: 'var(--font-size-base)',
            fontFamily: 'inherit',
            cursor: 'pointer',
            background: 'var(--text-primary)',
            color: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 6,
          }}
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
            padding: '10px 20px',
            fontSize: 'var(--font-size-base)',
            fontFamily: 'inherit',
            cursor: hasTape ? 'pointer' : 'not-allowed',
            background: hasTape ? 'transparent' : 'var(--bg-tertiary)',
            color: hasTape ? 'var(--text-primary)' : 'var(--text-muted)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            opacity: hasTape ? 1 : 0.6,
          }}
        >
          Load story.json (optional)
        </button>
      </div>
      {hasTape && (
        <>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--font-size-base)' }}>
            Tape loaded. Load a story or continue with default.
          </p>
          {onContinueWithDefault && (
            <button
              onClick={onContinueWithDefault}
              style={{
                padding: '10px 20px',
                fontSize: 'var(--font-size-base)',
                fontFamily: 'inherit',
                cursor: 'pointer',
                background: 'transparent',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
              }}
            >
              Continue with default story
            </button>
          )}
        </>
      )}
    </div>
  );
}
