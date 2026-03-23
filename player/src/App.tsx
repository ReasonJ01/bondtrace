import { useState, useCallback, useEffect } from 'react';
import type { Tape } from './types/tape';
import type { Story } from './types/story';
import { createDefaultStory } from './types/story';
import { FileLoader } from './components/FileLoader';
import { PlayerLayout } from './components/PlayerLayout';
import { FlowBuilder } from './components/FlowBuilder';

const STORAGE_KEY_TAPE = 'bondtrace-tape';
const STORAGE_KEY_STORY = 'bondtrace-story';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '') || '';

type RoutePath = '' | 'builder' | 'playback' | 'playback/tape' | 'playback/player';

function getPathFromLocation(): RoutePath {
  const pathname = window.location.pathname;
  const path = pathname === BASE || pathname === `${BASE}/` ? '' : pathname.slice(BASE.length).replace(/^\//, '');
  if (path === 'builder') return 'builder';
  if (path === 'playback/player') return 'playback/player';
  if (path === 'playback/tape') return 'playback/tape';
  if (path === 'playback') return 'playback';
  return '';
}

function pushRoute(path: RoutePath) {
  const url = path ? `${BASE}/${path}` : BASE || '/';
  window.history.pushState(null, '', url);
}

function replaceRoute(path: RoutePath) {
  const url = path ? `${BASE}/${path}` : BASE || '/';
  window.history.replaceState(null, '', url);
}

function loadFromStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function saveToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota or other storage errors
  }
}

function LandingChoice({ onChoose }: { onChoose: (mode: 'playback' | 'builder') => void }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'var(--bg-primary)',
      }}
    >
      <div
        style={{
          maxWidth: 980,
          width: '100%',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 18,
        }}
      >
        <a
          href="/playback"
          onClick={(e) => {
            e.preventDefault();
            onChoose('playback');
          }}
          style={{
            padding: 28,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            textAlign: 'left',
            cursor: 'pointer',
            textDecoration: 'none',
            display: 'block',
          }}
        >
          <div style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
            Playback
          </div>
          <h1 style={{ margin: '0 0 8px 0', fontSize: 28 }}>Review recorded tapes</h1>
          <div style={{ color: 'var(--text-secondary)' }}>
            Load an existing `tape.json`, add a story, and present the flow step by step.
          </div>
        </a>

        <a
          href="/builder"
          onClick={(e) => {
            e.preventDefault();
            onChoose('builder');
          }}
          style={{
            padding: 28,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            textAlign: 'left',
            cursor: 'pointer',
            textDecoration: 'none',
            display: 'block',
          }}
        >
          <div style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
            Builder
          </div>
          <h1 style={{ margin: '0 0 8px 0', fontSize: 28 }}>Construct `.http` flows</h1>
          <div style={{ color: 'var(--text-secondary)' }}>
            Import an OpenAPI YAML file, choose requests, add waits, and export a recorder-ready flow file.
          </div>
        </a>
      </div>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState<'landing' | 'playback' | 'builder'>(() => {
    const route = getPathFromLocation();
    if (route === 'builder') return 'builder';
    if (route === 'playback' || route === 'playback/tape' || route === 'playback/player') return 'playback';
    return 'landing';
  });
  const [tape, setTape] = useState<Tape | null>(() => loadFromStorage<Tape>(STORAGE_KEY_TAPE));
  const [story, setStory] = useState<Story | null>(() => loadFromStorage<Story>(STORAGE_KEY_STORY));

  useEffect(() => {
    replaceRoute(getPathFromLocation() || '');
  }, []);

  useEffect(() => {
    if (tape) saveToStorage(STORAGE_KEY_TAPE, tape);
    else localStorage.removeItem(STORAGE_KEY_TAPE);
  }, [tape]);

  useEffect(() => {
    if (story) saveToStorage(STORAGE_KEY_STORY, story);
    else localStorage.removeItem(STORAGE_KEY_STORY);
  }, [story]);

  useEffect(() => {
    const onPopState = () => {
      const route = getPathFromLocation();
      if (route === 'builder') {
        setMode('builder');
      } else if (route === '') {
        setMode('landing');
      } else if (route === 'playback') {
        setMode('playback');
        setTape(null);
        setStory(null);
      } else if (route === 'playback/tape') {
        setMode('playback');
        setStory(null);
      } else if (route === 'playback/player') {
        setMode('playback');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleTapeLoad = useCallback((loadedTape: Tape) => {
    setTape(loadedTape);
    setStory(null);
    setMode('playback');
    pushRoute('playback/tape');
  }, []);

  const handleStoryLoad = useCallback((loadedStory: Story) => {
    setStory(loadedStory);
    setMode('playback');
    pushRoute('playback/player');
  }, []);

  const handleContinueWithDefault = useCallback(() => {
    if (tape) {
      setStory(createDefaultStory(tape));
      setMode('playback');
      pushRoute('playback/player');
    }
  }, [tape]);

  const handleReset = useCallback(() => {
    setTape(null);
    setStory(null);
    setMode('landing');
    replaceRoute('');
  }, []);

  const handleChoose = useCallback((targetMode: 'playback' | 'builder') => {
    setMode(targetMode);
    if (targetMode === 'builder') pushRoute('builder');
    else pushRoute('playback');
  }, []);

  const handleBackToPlayback = useCallback(() => {
    if (tape) {
      setMode('playback');
      pushRoute(story ? 'playback/player' : 'playback/tape');
    } else {
      setMode('landing');
      pushRoute('');
    }
  }, [tape, story]);

  const handleBack = useCallback(() => {
    window.history.back();
  }, []);

  if (mode === 'builder') {
    return <FlowBuilder onBackToPlayback={handleBackToPlayback} />;
  }

  if (mode === 'landing') {
    return <LandingChoice onChoose={handleChoose} />;
  }

  if (!tape) {
    return (
      <FileLoader
        onTapeLoad={handleTapeLoad}
        onStoryLoad={handleStoryLoad}
        onBack={handleBack}
        hasTape={false}
        onContinueWithDefault={undefined}
      />
    );
  }

  if (!story) {
    return (
      <FileLoader
        onTapeLoad={handleTapeLoad}
        onStoryLoad={handleStoryLoad}
        onBack={handleBack}
        hasTape={true}
        onContinueWithDefault={handleContinueWithDefault}
      />
    );
  }

  return (
    <PlayerLayout
      tape={tape}
      story={story}
      onStoryChange={setStory}
      onStoryLoad={handleStoryLoad}
      onReset={handleReset}
    />
  );
}
