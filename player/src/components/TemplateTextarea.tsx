import { useState, useRef, useEffect, useCallback } from 'react';

function flattenPaths(obj: unknown, prefix = '', maxDepth = 3): string[] {
  if (obj == null || typeof obj !== 'object' || maxDepth <= 0) return [];
  const result: string[] = [];
  const o = obj as Record<string, unknown>;
  for (const key of Object.keys(o)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const val = o[key];
    if (val != null && typeof val === 'object' && !Array.isArray(val) && maxDepth > 1) {
      result.push(...flattenPaths(val, path, maxDepth - 1));
    } else {
      result.push(path);
    }
  }
  return result;
}

interface TemplateTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  style?: React.CSSProperties;
  persistentFieldKeys: string[];
  responseBody: unknown;
  isPreTemplate: boolean;
}

export function TemplateTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  style,
  persistentFieldKeys,
  responseBody,
  isPreTemplate,
}: TemplateTextareaProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [insertStart, setInsertStart] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const updateSuggestions = useCallback(
    (text: string, cursorPos: number) => {
      const beforeCursor = text.slice(0, cursorPos);
      const match = beforeCursor.match(/\{\{([^}]*)$/);
      if (!match) {
        setShowSuggestions(false);
        return;
      }
      const partial = match[1].trim().toLowerCase();
      const insertStartPos = beforeCursor.length - match[1].length - 2;
      setInsertStart(insertStartPos);

      const stateSugs = persistentFieldKeys.map((k) => `state.${k}`);
      const respSugs = !isPreTemplate && responseBody ? flattenPaths(responseBody, 'response.body', 2) : [];
      const all = [...stateSugs, ...respSugs];

      const filtered = partial
        ? all.filter((s) => s.toLowerCase().startsWith(partial))
        : all;
      // Only show when prefix matches something; hide if no matches
      setSuggestions(filtered);
      setSelectedIndex(0);
      setShowSuggestions(filtered.length > 0);
    },
    [persistentFieldKeys, isPreTemplate, responseBody]
  );

  useEffect(() => {
    if (showSuggestions && listRef.current) {
      const el = listRef.current.children[selectedIndex] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, showSuggestions]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    onChange(v);
    updateSuggestions(v, e.target.selectionStart ?? v.length);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSuggestions) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (suggestions.length > 0) {
        e.preventDefault();
        insertSuggestion(suggestions[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const insertSuggestion = (suggestion: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = insertStart;
    const cursorPos = ta.selectionStart;
    const before = value.slice(0, start);
    const after = value.slice(cursorPos);
    const newValue = before + `{{${suggestion}}}` + after;
    onChange(newValue);
    setShowSuggestions(false);
    setTimeout(() => {
      ta.focus();
      const pos = start + suggestion.length + 4;
      ta.setSelectionRange(pos, pos);
    }, 0);
  };

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        spellCheck={false}
        onSelect={() => {
          const ta = textareaRef.current;
          if (ta) updateSuggestions(value, ta.selectionStart);
        }}
        placeholder={placeholder}
        rows={rows}
        style={{ ...style, resize: 'vertical' }}
      />
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={listRef}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '100%',
            marginTop: 4,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            maxHeight: 200,
            overflow: 'auto',
            zIndex: 100,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          {suggestions.map((s, i) => (
            <div
              key={s}
              onClick={() => insertSuggestion(s)}
              style={{
                padding: '8px 12px',
                fontSize: 'var(--font-size-sm)',
                fontFamily: 'inherit',
                cursor: 'pointer',
                background: i === selectedIndex ? 'var(--bg-tertiary)' : 'transparent',
                color: 'var(--text-primary)',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : undefined,
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              {s.startsWith('state.') ? (
                <span>
                  <span style={{ color: 'var(--timeline-active)' }}>state</span>
                  <span style={{ color: 'var(--text-secondary)' }}>.{s.slice(6)}</span>
                </span>
              ) : (
                <span>
                  <span style={{ color: 'var(--timeline-active)' }}>response.body</span>
                  <span style={{ color: 'var(--text-secondary)' }}>.{s.replace('response.body.', '')}</span>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
