import { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Search, ArrowUp } from "lucide-react";

interface SearchInputBarProps {
  aiQuery: string;
  setAiQuery: (q: string) => void;
  isAILoading: boolean;
  animationActive: boolean;
  typedPlaceholder: string;
  suppressNextFocusRef: React.MutableRefObject<boolean>;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  setAnimationActive: (v: boolean) => void;
  setTypedPlaceholder: (v: string) => void;
  onSubmit: (q: string) => void;
}

export function SearchInputBar({
  aiQuery,
  setAiQuery,
  isAILoading,
  animationActive,
  typedPlaceholder,
  suppressNextFocusRef,
  inputRef,
  setAnimationActive,
  setTypedPlaceholder,
  onSubmit,
}: SearchInputBarProps) {
  const handleReset = () => {
    setAnimationActive(false);
    setTypedPlaceholder("");
    // Only collapse height when there is no real content (animation-placeholder mode).
    // If the user already has text typed, preserve the expanded height so tapping
    // away and back does not shrink the bar mid-edit.
    if (!aiQuery && inputRef.current) inputRef.current.style.height = '48px';
  };

  const displayedValue = animationActive && !aiQuery ? typedPlaceholder : aiQuery;

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.overflow = 'hidden';
    const newH = Math.min(el.scrollHeight, 120);
    el.style.height = newH + 'px';
    window.dispatchEvent(new CustomEvent('df:searchbar-resize', { detail: { extra: Math.max(0, newH - 48) } }));
  }, [displayedValue]);

  return (
    <div className="p-4 md:p-6 border-t border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl">
      <div className="max-w-4xl mx-auto">
        <div className="relative">
          <div className="relative rounded-2xl transition-all duration-500 transform hover:scale-[1.01]">
            <div className="absolute -inset-0.5 bg-blue-500 rounded-2xl blur-md opacity-30 pointer-events-none" />
            <div className="relative bg-gradient-to-r from-blue-500 to-blue-600 p-[1px] rounded-2xl shadow-2xl shadow-blue-500/20">
              <div className="relative flex items-center bg-white dark:bg-black rounded-2xl">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
                <textarea
                  ref={inputRef}
                  rows={1}
                  placeholder={animationActive && !aiQuery ? "" : "Prompt your search"}
                  value={animationActive && !aiQuery ? typedPlaceholder : aiQuery}
                  onChange={(e) => {
                    setAiQuery(e.target.value);
                    const el = e.target;
                    el.style.height = 'auto';
                    el.style.overflow = 'hidden';
                    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                  }}
                  onMouseDown={handleReset}
                  onTouchStart={handleReset}
                  onFocus={() => {
                    if (suppressNextFocusRef.current) { suppressNextFocusRef.current = false; return; }
                    handleReset();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && aiQuery.trim()) {
                      e.preventDefault();
                      onSubmit(aiQuery);
                      setAiQuery('');
                      if (inputRef.current) inputRef.current.style.height = '48px';
                    }
                  }}
                  className={`w-full min-h-[48px] max-h-[120px] pl-10 pr-14 py-3 text-sm font-medium bg-transparent rounded-2xl border-0 focus:ring-0 focus:outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-none leading-6 ${animationActive && !aiQuery ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}
                  style={{ height: '48px', overflow: 'hidden' }}
                />
                <Button
                  size="icon"
                  onClick={() => {
                    if (aiQuery.trim()) {
                      onSubmit(aiQuery);
                      setAiQuery('');
                      if (inputRef.current) inputRef.current.style.height = '48px';
                    }
                  }}
                  disabled={!aiQuery.trim() || isAILoading}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50 group border-0"
                >
                  <ArrowUp className="w-4 h-4 stroke-[3] text-white transition-transform duration-200 group-hover:-translate-y-0.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
        <p className="text-center mt-2 sm:mt-3 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 relative z-20">
          Need inspiration?{" "}
          <button
            type="button"
            onClick={() => { window.location.href = '/home#deepsearch-examples'; }}
            className="text-blue-500 hover:text-blue-400 hover:underline transition-colors cursor-pointer relative z-20"
          >
            See DeepSearch Prompt Examples
          </button>
        </p>
      </div>
    </div>
  );
}
