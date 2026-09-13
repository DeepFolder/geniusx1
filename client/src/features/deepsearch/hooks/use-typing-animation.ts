import { useState, useRef, useEffect } from "react";
import { TYPING_PROMPTS } from "../constants";

function buildShuffledOrder(avoidFirst?: number): number[] {
  const order = TYPING_PROMPTS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (order.length >= 2 && avoidFirst !== undefined && order[0] === avoidFirst) {
    [order[0], order[1]] = [order[1], order[0]];
  }
  return order;
}

interface TypingState {
  order: number[];
  cursor: number;
  charIndex: number;
  deleting: boolean;
}

interface UseTypingAnimationResult {
  typedPlaceholder: string;
  animationActive: boolean;
  setAnimationActive: (active: boolean) => void;
  typingStateRef: React.MutableRefObject<TypingState>;
  buildShuffledOrder: (avoidFirst?: number) => number[];
}

export function useTypingAnimation(aiQuery: string, isSidebarOpen: boolean): UseTypingAnimationResult {
  const [typedPlaceholder, setTypedPlaceholder] = useState("");
  const [animationActive, setAnimationActive] = useState(true);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialOrderRef = useRef<number[] | null>(null);
  if (initialOrderRef.current === null) {
    initialOrderRef.current = buildShuffledOrder();
  }

  const typingStateRef = useRef<TypingState>({
    order: initialOrderRef.current,
    cursor: 0,
    charIndex: 0,
    deleting: false,
  });

  useEffect(() => {
    const clearTimer = () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };

    if (!animationActive || aiQuery) {
      setTypedPlaceholder("");
      return clearTimer;
    }

    const tick = () => {
      clearTimer();
      const state = typingStateRef.current;
      const promptIndex = state.order[state.cursor];
      const current = TYPING_PROMPTS[promptIndex];

      if (!state.deleting) {
        if (state.charIndex < current.length) {
          state.charIndex++;
          setTypedPlaceholder(current.slice(0, state.charIndex));
          typingTimeoutRef.current = setTimeout(tick, 24);
        } else {
          typingTimeoutRef.current = setTimeout(() => {
            state.deleting = true;
            tick();
          }, 900);
        }
      } else {
        if (state.charIndex > 0) {
          state.charIndex--;
          setTypedPlaceholder(current.slice(0, state.charIndex));
          typingTimeoutRef.current = setTimeout(tick, 18);
        } else {
          state.deleting = false;
          state.cursor++;
          if (state.cursor >= state.order.length) {
            state.order = buildShuffledOrder(promptIndex);
            state.cursor = 0;
          }
          typingTimeoutRef.current = setTimeout(tick, 0);
        }
      }
    };

    tick();
    return clearTimer;
  }, [animationActive, aiQuery]);

  useEffect(() => {
    if (isSidebarOpen) setAnimationActive(false);
  }, [isSidebarOpen]);

  return { typedPlaceholder, animationActive, setAnimationActive, typingStateRef, buildShuffledOrder };
}
