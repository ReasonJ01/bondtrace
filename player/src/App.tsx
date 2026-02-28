import { useState, useCallback, useEffect } from 'react';
import type { Tape } from './types/tape';
import type { Story } from './types/story';
import { createDefaultStory } from './types/story';
import { FileLoader } from './components/FileLoader';
import { PlayerLayout } from './components/PlayerLayout';

const STORAGE_KEY_TAPE = 'bondtrace-tape';
const STORAGE_KEY_STORY = 'bondtrace-story';

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

export default function App() {
  const [tape, setTape] = useState<Tape | null>(() => loadFromStorage<Tape>(STORAGE_KEY_TAPE));
  const [story, setStory] = useState<Story | null>(() => loadFromStorage<Story>(STORAGE_KEY_STORY));

  useEffect(() => {
    if (tape) saveToStorage(STORAGE_KEY_TAPE, tape);
    else localStorage.removeItem(STORAGE_KEY_TAPE);
  }, [tape]);

  useEffect(() => {
    if (story) saveToStorage(STORAGE_KEY_STORY, story);
    else localStorage.removeItem(STORAGE_KEY_STORY);
  }, [story]);

  const handleTapeLoad = useCallback((loadedTape: Tape) => {
    setTape(loadedTape);
    setStory(null);
  }, []);

  const handleStoryLoad = useCallback((loadedStory: Story) => {
    setStory(loadedStory);
  }, []);

  const handleContinueWithDefault = useCallback(() => {
    if (tape) {
      setStory(createDefaultStory(tape));
    }
  }, [tape]);

  const handleReset = useCallback(() => {
    setTape(null);
    setStory(null);
  }, []);

  if (!tape) {
    return (
      <FileLoader
        onTapeLoad={handleTapeLoad}
        onStoryLoad={handleStoryLoad}
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
      onReset={handleReset}
    />
  );
}
