import { useMemo } from "react";

interface SearchHighlightProps {
  text: string;
  searchQuery: string;
  className?: string;
}

export default function SearchHighlight({ text, searchQuery, className = "" }: SearchHighlightProps) {
  const highlightedText = useMemo(() => {
    if (!searchQuery || !text) return text;

    const words = searchQuery.toLowerCase().split(/\s+/).filter(word => word.length > 0);
    if (words.length === 0) return text;

    let highlightedText = text;
    
    words.forEach(word => {
      const regex = new RegExp(`(${word})`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-700/60 text-yellow-900 dark:text-yellow-100 px-1 py-0.5 rounded font-medium">$1</mark>');
    });

    return highlightedText;
  }, [text, searchQuery]);

  return (
    <span 
      className={className}
      dangerouslySetInnerHTML={{ __html: highlightedText }}
    />
  );
}