import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY_CHAT_WIDTH = "genius-chat-width";
const STORAGE_KEY_CHAT_COLLAPSED = "genius-chat-collapsed";
const STORAGE_KEY_TREE_COLLAPSED = "genius-tree-collapsed";
const DEFAULT_CHAT_WIDTH = 380;
const MIN_CHAT_WIDTH = 240;
const MAX_CHAT_WIDTH = 560;

/**
 * Responsive visibility for the right-panel wrapper:
 * - mobile: follow the active tab
 * - md: show only the collapsed edge tab
 * - lg+: always render the panel or its collapsed edge tab
 */
export function outlinePanelVisibilityClasses(
  isMobileTreeActive: boolean,
  treeCollapsed: boolean,
): string {
  return [
    isMobileTreeActive ? "flex" : "hidden",
    treeCollapsed ? "md:flex" : "md:hidden",
    "lg:flex",
  ].join(" ");
}

function readSession(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeSession(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function usePanelState() {
  const [chatWidth, setChatWidthRaw] = useState<number>(() => {
    const v = parseInt(readSession(STORAGE_KEY_CHAT_WIDTH, String(DEFAULT_CHAT_WIDTH)), 10);
    return isNaN(v) ? DEFAULT_CHAT_WIDTH : Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, v));
  });
  const [chatCollapsed, setChatCollapsedRaw] = useState<boolean>(
    () => readSession(STORAGE_KEY_CHAT_COLLAPSED, "true") === "true"
  );
  const [treeCollapsed, setTreeCollapsedRaw] = useState<boolean>(
    () => readSession(STORAGE_KEY_TREE_COLLAPSED, "true") === "true"
  );

  const setChatWidth = useCallback((w: number) => {
    const clamped = Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, w));
    setChatWidthRaw(clamped);
    writeSession(STORAGE_KEY_CHAT_WIDTH, String(clamped));
  }, []);

  const setChatCollapsed = useCallback((v: boolean) => {
    setChatCollapsedRaw(v);
    writeSession(STORAGE_KEY_CHAT_COLLAPSED, String(v));
  }, []);

  const setTreeCollapsed = useCallback((v: boolean) => {
    setTreeCollapsedRaw(v);
    writeSession(STORAGE_KEY_TREE_COLLAPSED, String(v));
  }, []);

  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  const latestWidth = useRef(chatWidth);
  useEffect(() => { latestWidth.current = chatWidth; }, [chatWidth]);

  const onDragStart = useCallback((e: React.PointerEvent) => {
    if (chatCollapsed) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = latestWidth.current;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }, [chatCollapsed]);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const delta = e.clientX - dragStartX.current;
    setChatWidth(dragStartWidth.current + delta);
  }, [setChatWidth]);

  const onDragEnd = useCallback(() => {
    isDragging.current = false;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, []);

  const onDragKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (chatCollapsed) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setChatWidth(latestWidth.current + 20);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setChatWidth(latestWidth.current - 20);
    }
  }, [chatCollapsed, setChatWidth]);

  const toggleChat = useCallback(() => setChatCollapsed(!chatCollapsed), [chatCollapsed, setChatCollapsed]);
  const toggleTree = useCallback(() => setTreeCollapsed(!treeCollapsed), [treeCollapsed, setTreeCollapsed]);
  const expandChat = useCallback(() => setChatCollapsed(false), [setChatCollapsed]);

  return {
    chatWidth,
    chatCollapsed,
    treeCollapsed,
    minChatWidth: MIN_CHAT_WIDTH,
    maxChatWidth: MAX_CHAT_WIDTH,
    toggleChat,
    toggleTree,
    expandChat,
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragKeyDown,
  };
}
