import { useEffect, useRef } from 'react';

export function useScrollLock(isOpen: boolean) {
  const scrollYRef = useRef(0);
  const scrollListenerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Store current scroll position
      scrollYRef.current = window.scrollY;
      
      // Immediately prevent any scrolling
      const preventScroll = () => {
        if (window.scrollY !== scrollYRef.current) {
          window.scrollTo(0, scrollYRef.current);
        }
      };

      // Disable scrollIntoView
      const originalScrollIntoView = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function() {
        // Prevent scroll
      };

      // Listen for scroll events and immediately restore position
      window.addEventListener('scroll', preventScroll, { passive: false });
      scrollListenerRef.current = preventScroll;

      // Also check scroll position frequently
      const intervalId = setInterval(preventScroll, 10);

      return () => {
        Element.prototype.scrollIntoView = originalScrollIntoView;
        window.removeEventListener('scroll', preventScroll);
        clearInterval(intervalId);
      };
    }
  }, [isOpen]);
}
