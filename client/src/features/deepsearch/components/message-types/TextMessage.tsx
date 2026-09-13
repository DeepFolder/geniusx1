import { useState } from "react";
import { Link } from "wouter";
import { Search } from "lucide-react";
import { RichTextRenderer } from "@/components/chat/RichTextRenderer";
import { TypingContent } from "../TypingContent";
import type { AISearchMessage } from "../../types";

const typedMessageIds = new Set<string>();

function renderUserLinks(content: string) {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    if (match.index > lastIndex) parts.push(content.slice(lastIndex, match.index));
    const [, linkText, linkPath] = match;
    parts.push(
      <Link key={match.index} href={linkPath} className="text-blue-300 hover:text-blue-100 underline cursor-pointer">{linkText}</Link>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) parts.push(content.slice(lastIndex));
  return parts.length > 0 ? parts : content;
}

interface TextMessageProps {
  message: AISearchMessage;
  onSearchAlternative?: (query: string) => void;
}

function AlternativeChips({ items, onSearch }: { items: { label: string; query: string }[]; onSearch: (q: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => onSearch(item.query)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:border-blue-400 dark:hover:border-blue-500 transition-colors cursor-pointer"
        >
          <Search className="w-3 h-3 flex-shrink-0" />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

export function TextMessage({ message, onSearchAlternative }: TextMessageProps) {
  const alreadyTyped = typedMessageIds.has(message.id);
  const [typingDone, setTypingDone] = useState(alreadyTyped);

  const handleTypingComplete = () => {
    typedMessageIds.add(message.id);
    setTypingDone(true);
  };

  const chips = message.alternativeSearches?.length && onSearchAlternative ? message.alternativeSearches : undefined;

  if (message.isUser) {
    return (
      <div className="text-xs md:text-sm leading-relaxed whitespace-pre-wrap">
        {renderUserLinks(message.displayContent ?? message.content)}
      </div>
    );
  }

  if (message.isStreaming) {
    return (
      <div className="text-xs md:text-sm leading-relaxed whitespace-pre-wrap">
        <TypingContent content={message.content} isLiveStreaming={true} />
        <span className="inline-block w-1.5 h-4 bg-blue-500 dark:bg-blue-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
      </div>
    );
  }

  if (message.isFromHistory || typingDone) {
    return (
      <div className="text-xs md:text-sm leading-relaxed whitespace-pre-wrap">
        <RichTextRenderer content={message.content} />
        {chips && <AlternativeChips items={chips} onSearch={onSearchAlternative!} />}
      </div>
    );
  }

  return (
    <div className="text-xs md:text-sm leading-relaxed whitespace-pre-wrap">
      <TypingContent content={message.content} onComplete={handleTypingComplete} />
      {chips && typingDone && <AlternativeChips items={chips} onSearch={onSearchAlternative!} />}
    </div>
  );
}
