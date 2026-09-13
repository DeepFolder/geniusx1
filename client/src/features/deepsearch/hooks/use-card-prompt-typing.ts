import { useState, useRef, useEffect } from "react";

export function useCardPromptTyping(text: string, enabled: boolean): { displayed: string } {
  const [displayed, setDisplayed] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayedRef = useRef("");
  const phaseRef = useRef<"typing" | "erasing">("typing");
  const prevTextRef = useRef(text);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };

    if (!enabled) {
      clearTimer();
      return;
    }

    if (prevTextRef.current !== text) {
      prevTextRef.current = text;
      phaseRef.current = "erasing";
    }

    const tick = () => {
      clearTimer();

      if (phaseRef.current === "erasing") {
        if (displayedRef.current.length > 0) {
          displayedRef.current = displayedRef.current.slice(0, -1);
          setDisplayed(displayedRef.current);
          timerRef.current = setTimeout(tick, 18);
        } else {
          phaseRef.current = "typing";
          timerRef.current = setTimeout(tick, 0);
        }
      } else {
        if (displayedRef.current.length < text.length) {
          displayedRef.current = text.slice(0, displayedRef.current.length + 1);
          setDisplayed(displayedRef.current);
          timerRef.current = setTimeout(tick, 24);
        }
      }
    };

    tick();
    return clearTimer;
  }, [text, enabled]);

  return { displayed };
}
