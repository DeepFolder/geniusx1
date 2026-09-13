import { createContext, useContext, useState, useCallback } from "react";

interface FeedbackChatContextValue {
  firstChatPrompt: string | null;
  setFirstChatPrompt: (prompt: string | null) => void;
}

const FeedbackChatContext = createContext<FeedbackChatContextValue>({
  firstChatPrompt: null,
  setFirstChatPrompt: () => {},
});

export function FeedbackChatProvider({ children }: { children: React.ReactNode }) {
  const [firstChatPrompt, _setFirstChatPrompt] = useState<string | null>(null);
  const setFirstChatPrompt = useCallback((prompt: string | null) => {
    _setFirstChatPrompt(prompt);
  }, []);
  return (
    <FeedbackChatContext.Provider value={{ firstChatPrompt, setFirstChatPrompt }}>
      {children}
    </FeedbackChatContext.Provider>
  );
}

export function useFeedbackChatContext() {
  return useContext(FeedbackChatContext);
}
