import { useRef, useEffect, useState } from 'react';

interface StatePanelProps {
  persistentValues: Record<string, unknown>;
  previousPersistentValues?: Record<string, unknown>;
  allPersistentKeys?: string[];
  excludedPersistentKeys?: string[];
  onExcludedKeysChange?: (keys: string[]) => void;
}

function valueEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'object' && typeof b === 'object' && a != null && b != null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function hasValue(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  return true;
}

export function StatePanel({
  persistentValues,
  previousPersistentValues = {},
  allPersistentKeys = [],
  excludedPersistentKeys = [],
  onExcludedKeysChange,
}: StatePanelProps) {
  const [isHovering, setIsHovering] = useState(false);
  const [showManageKeys, setShowManageKeys] = useState(false);
  const excluded = new Set(excludedPersistentKeys);
  const prevKeys = new Set(Object.keys(previousPersistentValues));
  let entries = Object.entries(persistentValues).filter(
    ([k, v]) => hasValue(v) && !excluded.has(k)
  );
  // Stack order: new keys first (not in previous state), then old keys in reverse insertion order
  entries = [...entries].sort(([a], [b]) => {
    const aNew = !prevKeys.has(a);
    const bNew = !prevKeys.has(b);
    if (aNew && !bNew) return -1;
    if (!aNew && bNew) return 1;
    return 0;
  });
  const newCount = entries.filter(([k]) => !prevKeys.has(k)).length;
  const oldEntries = entries.slice(newCount).reverse();
  entries = [...entries.slice(0, newCount), ...oldEntries];
  const prevValuesRef = useRef<Record<string, unknown>>({});
  const [animatingKeys, setAnimatingKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    const allEntries = Object.entries(persistentValues);
    const toAnimate = new Set<string>();
    for (const [key, value] of allEntries) {
      if (!hasValue(value)) continue;
      const prev = prevValuesRef.current[key];
      if (prev === undefined) {
        toAnimate.add(key);
      } else if (!valueEquals(prev, value)) {
        toAnimate.add(key);
      }
    }
    prevValuesRef.current = { ...persistentValues };
    if (toAnimate.size > 0) {
      setAnimatingKeys(toAnimate);
      const id = setTimeout(() => setAnimatingKeys(new Set()), 400);
      return () => clearTimeout(id);
    }
  }, [persistentValues]);

  const toggleKey = (key: string) => {
    if (!onExcludedKeysChange) return;
    const isExcluded = excluded.has(key);
    if (isExcluded) {
      onExcludedKeysChange(excludedPersistentKeys.filter((k) => k !== key));
    } else {
      onExcludedKeysChange([...excludedPersistentKeys, key]);
    }
  };

  if (entries.length === 0 && (!onExcludedKeysChange || allPersistentKeys.length === 0)) return null;

  return (
    <div
      style={{ padding: 12, position: 'relative' }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <h3 style={{ margin: '0 0 10px 0', fontSize: 'var(--font-size-base)', fontWeight: 500, color: 'var(--text-muted)' }}>
        Persistent State
      </h3>
      {!showManageKeys && onExcludedKeysChange && (isHovering || allPersistentKeys.length === 0) && (
        <button
          onClick={() => setShowManageKeys(true)}
          title="Show/hide variables"
          style={{
            position: 'absolute',
            top: 8,
            right: 12,
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
      {showManageKeys && onExcludedKeysChange && (
        <button
          onClick={() => setShowManageKeys(false)}
          title="Close"
          style={{
            position: 'absolute',
            top: 8,
            right: 12,
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
      {entries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {entries.map(([key, value]) => (
          <div
            key={key}
            className={animatingKeys.has(key) ? 'state-value-updated' : undefined}
            style={{
              padding: '6px 10px',
              background: 'var(--bg-tertiary)',
              borderRadius: 4,
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 2 }}>{key}</div>
            <div
              style={{
                fontSize: 'var(--font-size-sm)',
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: 'var(--text-primary)',
              }}
              title={typeof value === 'object' ? JSON.stringify(value) : String(value)}
            >
              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
            </div>
          </div>
        ))}
        </div>
      )}
      {showManageKeys && onExcludedKeysChange && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderTop: '1px solid var(--border)',
            maxHeight: 200,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>
            Show/hide variables
          </div>
          {allPersistentKeys.map((key) => {
            const isExcluded = excluded.has(key);
            return (
              <label
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-sm)',
                  color: isExcluded ? 'var(--text-muted)' : 'var(--text-secondary)',
                }}
              >
                <input
                  type="checkbox"
                  checked={!isExcluded}
                  onChange={() => toggleKey(key)}
                  style={{ accentColor: 'var(--timeline-active)' }}
                />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {key}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
