import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Pin, PinOff, Pencil, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GeniusListItem } from "./types";

interface Props {
  history: GeniusListItem[];
  onNew: () => void;
  onLoad: (id: number) => void;
  onDelete: (id: number) => void;
  onPin: (id: number, pinned: boolean) => void;
  onRename: (id: number, title: string) => void;
  onClose: () => void;
  readOnly?: boolean;
}

/** Returns true if the primary input is a touchscreen (no hover capability). */
function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch(window.matchMedia("(hover: none) and (pointer: coarse)").matches);
  }, []);
  return isTouch;
}

/**
 * Hook that fires a callback after the user holds a touch for `delay` ms.
 * Critically, `onTouchEnd` calls `preventDefault()` when the long press fired
 * so the browser's synthesized click (which would load the item) is suppressed.
 */
function useLongPress(onLongPress: (e: React.TouchEvent) => void, delay = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const savedEvent = useRef<React.TouchEvent | null>(null);

  const start = (e: React.TouchEvent) => {
    fired.current = false;
    // Clone the touch list data we need before the event object is reused
    savedEvent.current = e;
    timerRef.current = setTimeout(() => {
      fired.current = true;
      if (savedEvent.current) onLongPress(savedEvent.current);
    }, delay);
  };

  const cancel = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // Do NOT reset fired here — end() needs to read it.
  };

  const end = (e: React.TouchEvent) => {
    cancel();
    if (fired.current) {
      // Suppress the synthesized click that the browser emits after touchend
      e.preventDefault();
      fired.current = false;
    }
  };

  const move = () => {
    cancel();
    fired.current = false;
  };

  return { onTouchStart: start, onTouchEnd: end, onTouchMove: move };
}

export function SidebarCalcActions({ history, onNew, onLoad, onDelete, onPin, onRename, onClose, readOnly = false }: Props) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: number } | null>(null);
  const [renamingItem, setRenamingItem] = useState<{ id: number; title: string } | null>(null);
  const isTouch = useIsTouchDevice();

  // Close the context menu on any outside click/tap
  useEffect(() => {
    const handleDismiss = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener("click", handleDismiss);
      document.addEventListener("touchstart", handleDismiss);
      return () => {
        document.removeEventListener("click", handleDismiss);
        document.removeEventListener("touchstart", handleDismiss);
      };
    }
  }, [contextMenu]);

  const openMenu = (x: number, y: number, id: number) => {
    if (readOnly) return;
    setContextMenu({ x, y, id });
  };

  const handleContextMenu = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    openMenu(e.clientX, e.clientY, id);
  };

  const handleDotButton = (e: React.MouseEvent | React.TouchEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openMenu(rect.left, rect.bottom + 4, id);
  };

  const activeItem = contextMenu ? history.find((h) => h.id === contextMenu.id) : null;

  return (
    <>
      <div className="flex flex-col gap-3 p-3">
        <Button
          size="sm"
          className="w-full justify-start gap-2 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
          onClick={() => { onNew(); onClose(); }}
          data-testid="button-new-calculation"
        >
          <Plus className="h-4 w-4" /> New Calculation
        </Button>

        {history.length > 0 && (
          <div>
            <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              History
            </p>
            <ul className="space-y-0">
              {history.map((item) => (
                <HistoryRow
                  key={item.id}
                  item={item}
                  isTouch={isTouch}
                  renamingItem={renamingItem}
                  setRenamingItem={setRenamingItem}
                  onLoad={onLoad}
                  onClose={onClose}
                  onRename={onRename}
                  onContextMenu={handleContextMenu}
                  onDotButton={handleDotButton}
                  openMenu={openMenu}
                  readOnly={readOnly}
                />
              ))}
            </ul>
          </div>
        )}

        {history.length === 0 && (
          <p className="px-1 text-xs text-gray-400 dark:text-gray-500">No saved calculations yet.</p>
        )}
      </div>

      {/* Context menu — rendered at trigger position */}
      {contextMenu && activeItem && (
        <div
          className="fixed z-[300] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setRenamingItem({ id: contextMenu.id, title: activeItem.title });
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 transition-colors min-h-[44px]"
          >
            <Pencil className="w-4 h-4 shrink-0" />
            Rename
          </button>
          <button
            onClick={() => {
              onPin(contextMenu.id, !activeItem.pinned);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 transition-colors min-h-[44px]"
          >
            {activeItem.pinned ? <PinOff className="w-4 h-4 shrink-0" /> : <Pin className="w-4 h-4 shrink-0" />}
            {activeItem.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            onClick={() => {
              onDelete(contextMenu.id);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 active:bg-red-100 dark:active:bg-red-900/40 transition-colors min-h-[44px]"
          >
            <Trash2 className="w-4 h-4 shrink-0" />
            Delete
          </button>
        </div>
      )}
    </>
  );
}

// ─── Row sub-component ────────────────────────────────────────────────────────

interface RowProps {
  item: GeniusListItem;
  isTouch: boolean;
  renamingItem: { id: number; title: string } | null;
  setRenamingItem: (v: { id: number; title: string } | null) => void;
  onLoad: (id: number) => void;
  onClose: () => void;
  onRename: (id: number, title: string) => void;
  onContextMenu: (e: React.MouseEvent, id: number) => void;
  onDotButton: (e: React.MouseEvent | React.TouchEvent, id: number) => void;
  openMenu: (x: number, y: number, id: number) => void;
  readOnly: boolean;
}

function HistoryRow({
  item,
  isTouch,
  renamingItem,
  setRenamingItem,
  onLoad,
  onClose,
  onRename,
  onContextMenu,
  onDotButton,
  openMenu,
  readOnly,
}: RowProps) {
  const longPress = useLongPress((e) => {
    const touch = e.changedTouches[0] ?? e.touches[0];
    if (touch) openMenu(touch.clientX, touch.clientY, item.id);
  });

  return (
    <li
      className="group rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/60 relative"
      onContextMenu={(e) => onContextMenu(e, item.id)}
      {...(isTouch ? longPress : {})}
    >
      {renamingItem?.id === item.id ? (
        <div className="flex items-center gap-1 px-2 py-1">
          <input
            autoFocus
            value={renamingItem.title}
            onChange={(e) => setRenamingItem({ ...renamingItem, title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const trimmed = renamingItem.title.trim();
                if (trimmed) onRename(item.id, trimmed);
                setRenamingItem(null);
              } else if (e.key === "Escape") {
                setRenamingItem(null);
              }
            }}
            onBlur={() => {
              const trimmed = renamingItem.title.trim();
              if (trimmed) onRename(item.id, trimmed);
              setRenamingItem(null);
            }}
            onFocus={(e) => { e.currentTarget.select(); }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 rounded bg-white dark:bg-gray-900 border border-blue-400 px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none"
          />
        </div>
      ) : (
        <div className="flex items-center pr-1">
           <button
            className="flex-1 min-w-0 truncate px-2 py-1 text-left text-sm text-gray-700 dark:text-gray-300 flex items-center"
            onClick={() => { onLoad(item.id); onClose(); }}
          >
            {item.pinned && (
              <span className="mr-1 inline-block text-blue-400 dark:text-blue-500 shrink-0" aria-label="Pinned">
                📌
              </span>
            )}
            <span className="truncate">{item.title}</span>
           </button>

          {/* "…" button: always visible on touch screens; shown on hover/focus on desktop */}
          <button
            aria-label="More options"
            onClick={(e) => onDotButton(e, item.id)}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDotButton(e, item.id);
            }}
            className={[
              "shrink-0 rounded p-1 text-gray-400 dark:text-gray-500",
              "hover:bg-gray-200 dark:hover:bg-gray-700 active:bg-gray-300 dark:active:bg-gray-600",
              "transition-colors flex items-center justify-center",
              // On non-touch screens show only on group hover/focus; on touch always show
              isTouch
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 focus:opacity-100",
            ].join(" ")}
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      )}
    </li>
  );
}
