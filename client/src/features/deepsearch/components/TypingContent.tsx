import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";

interface TypingContentProps {
  content: string;
  skipAnimation?: boolean;
  isLiveStreaming?: boolean;
  onComplete?: () => void;
}

function renderWithLinks(text: string) {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const [, linkText, linkPath] = match;
    parts.push(
      <Link
        key={match.index}
        href={linkPath}
        className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline cursor-pointer"
      >
        {linkText}
      </Link>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : text;
}

// Split content into word-level tokens, preserving spaces as part of each token.
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  // Match a word (optionally with a trailing space) or a standalone whitespace run
  const re = /\S+\s*/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(text)) !== null) {
    tokens.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push(text.slice(last));
  return tokens;
}

export function TypingContent({
  content,
  skipAnimation = false,
  isLiveStreaming = false,
  onComplete,
}: TypingContentProps) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const tokensRef = useRef<string[]>([]);
  const prevContentRef = useRef(content);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const skipToEnd = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setSkipped(true);
    setVisibleCount(tokensRef.current.length);
    onCompleteRef.current?.();
  }, []);

  useEffect(() => {
    if (isLiveStreaming || skipAnimation) return;

    // Reset on new content
    if (content !== prevContentRef.current || visibleCount === 0) {
      prevContentRef.current = content;
      tokensRef.current = tokenize(content);
      setVisibleCount(0);
      setSkipped(false);

      let index = 0;
      const tokens = tokensRef.current;

      const tick = () => {
        // Emit 1–2 words per tick for a natural cadence
        const batch = 1 + Math.floor(Math.random() * 2);
        index = Math.min(index + batch, tokens.length);
        setVisibleCount(index);
        if (index < tokens.length) {
          timeoutRef.current = setTimeout(tick, 12 + Math.random() * 8);
        } else {
          onCompleteRef.current?.();
        }
      };

      timeoutRef.current = setTimeout(tick, 0);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, skipAnimation, isLiveStreaming]);

  if (skipAnimation || isLiveStreaming) {
    return <span>{renderWithLinks(content)}</span>;
  }

  const tokens = tokensRef.current;
  const isDone = skipped || visibleCount >= tokens.length;

  return (
    <span
      onClick={!isDone ? skipToEnd : undefined}
      title={!isDone ? "Click to skip animation" : undefined}
      style={!isDone ? { cursor: "pointer" } : undefined}
    >
      {/* All but the last visible token: fully visible, no animation */}
      {tokens.slice(0, Math.max(0, visibleCount - 1)).join("")}
      {/* Last visible token: fades in as the leading edge */}
      {visibleCount > 0 && (
        <span key={visibleCount} className={!skipped ? "typing-fade" : undefined}>
          {tokens[visibleCount - 1]}
        </span>
      )}
    </span>
  );
}
