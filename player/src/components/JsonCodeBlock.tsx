import type { CSSProperties } from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import { useTheme } from '../context/ThemeContext';

interface JsonCodeBlockProps {
  content: string;
  language?: 'json' | 'plain';
  style?: CSSProperties;
}

function tryPrettyJson(raw: string): string {
  if (!raw.trim()) return raw;
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

export function JsonCodeBlock({ content, language = 'json', style }: JsonCodeBlockProps) {
  const { theme } = useTheme();
  const displayContent = language === 'json' ? tryPrettyJson(content) : content;
  const lang = language === 'json' ? 'json' : 'plaintext';

  return (
    <div className="json-code-block">
      <Highlight
        prism={Prism}
        theme={theme === 'light' ? themes.github : themes.oneDark}
        code={displayContent || '(empty)'}
        language={lang}
      >
        {({ className, style: prismStyle, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={className}
            style={{
              ...prismStyle,
              margin: 0,
              padding: 16,
              overflow: 'auto',
              fontSize: 'var(--font-size-sm)',
              lineHeight: 1.6,
              maxHeight: 400,
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: theme === 'light' ? '#f6f8fa' : '#1e1e1e',
              ...style,
            }}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
