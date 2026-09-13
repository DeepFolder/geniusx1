import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, Globe, Paperclip, Loader2, ClipboardList, Square, Camera, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LoginModal } from "@/components/auth/LoginModal";

interface Props {
  onSend: (text: string) => void;
  /** Direct calculation update — always bypasses the refine/proposal flow. Used when plan mode is off. */
  onSendDirect: (text: string) => void;
  onPlan: (text: string) => void;
  isSending: boolean;
  isPlanning: boolean;
  webSearch: boolean;
  onToggleWebSearch: () => void;
  expertMode: boolean;
  onToggleExpertMode: () => void;
  phdMode: boolean;
  onTogglePhdMode: () => void;
  onUpload: (file: File, promptText?: string) => void;
  isUploading: boolean;
  /** When true the animated placeholder is suppressed and a follow-up hint is shown instead. */
  hasCalc?: boolean;
  /** When true, submit always routes to onSend (refine) and the Plan button is hidden. */
  hasPendingProposal?: boolean;
  /** When true, every proposal in the chat has been discarded — shows a hint and disables refine. */
  allProposalsDiscarded?: boolean;
  /** False for unauthenticated guests — submission opens the login modal instead. */
  isAuthenticated?: boolean;
  /** When provided and isSending is true, the send button becomes a stop button. */
  onStop?: () => void;
  /** True when there is an active cancellable job running. */
  canStop?: boolean;
  /** A saved historical worksheet must not start or change a calculation. */
  readOnly?: boolean;
}

const ACCEPT_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf",
]);
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";

const EXAMPLES = [
  "Size the motor for a ball screw actuator delivering 30 kN at 150 mm/s…",
  "Calculate the deflection of a simply supported steel beam under load…",
  "Find the required pipe diameter for 5 L/s of water at 2 m/s…",
  "Size a heat exchanger to cool 10 kg/s of oil from 90°C to 40°C…",
];

function useTypedPlaceholder(active: boolean) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!active) { setText(""); return; }
    let ex = 0, ch = 0, deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const full = EXAMPLES[ex];
      if (!deleting) {
        ch++;
        setText(full.slice(0, ch));
        if (ch >= full.length) { deleting = true; timer = setTimeout(tick, 1800); return; }
      } else {
        ch--;
        setText(full.slice(0, ch));
        if (ch <= 0) { deleting = false; ex = (ex + 1) % EXAMPLES.length; }
      }
      timer = setTimeout(tick, deleting ? 24 : 42);
    };
    timer = setTimeout(tick, 400);
    return () => clearTimeout(timer);
  }, [active]);
  return text;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

export function GeniusChatBar({ onSend, onSendDirect, onPlan, isSending, isPlanning, webSearch, onToggleWebSearch, expertMode, onToggleExpertMode, phdMode, onTogglePhdMode, onUpload, isUploading, hasCalc, hasPendingProposal, allProposalsDiscarded, isAuthenticated = true, onStop, canStop, readOnly = false }: Props) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);
  const isMobile = useIsMobile();
  // Animation runs only for unauthenticated guests who haven't started typing.
  // Once logged in, isAuthenticated=true → idle is always false → animation stops permanently.
  const idle = !isAuthenticated && !input && !focused && !isSending && !hasCalc;
  const typed = useTypedPlaceholder(idle);
  const busy = isSending || isPlanning;

  // Revoke preview URL when pendingFile changes to avoid memory leaks.
  useEffect(() => {
    if (!pendingFile) {
      setPendingPreviewUrl(null);
      return;
    }
    if (pendingFile.type.startsWith("image/")) {
      const url = URL.createObjectURL(pendingFile);
      setPendingPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPendingPreviewUrl(null);
    }
  }, [pendingFile]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 300) + "px";
  }, [input]);

  // Close the attach menu when clicking outside.
  useEffect(() => {
    if (!showAttachMenu) return;
    const handler = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAttachMenu]);

  const stageFile = useCallback((file: File) => {
    if (!ACCEPT_TYPES.has(file.type) || readOnly || busy || isUploading) return;
    if (!isAuthenticated) { setShowLoginModal(true); return; }
    setPendingFile(file);
  }, [busy, isUploading, isAuthenticated, readOnly]);

  // Legacy alias — kept so handleDrop/handlePaste can call stageFile.
  const pickFile = stageFile;

  const clearPendingFile = useCallback(() => {
    setPendingFile(null);
  }, []);

  const handleAttachClick = useCallback(() => {
    if (readOnly || busy || isUploading) return;
    if (!isAuthenticated) { setShowLoginModal(true); return; }
    if (isMobile) {
      setShowAttachMenu((v) => !v);
    } else {
      fileRef.current?.click();
    }
  }, [busy, isUploading, isAuthenticated, isMobile, readOnly]);

  const submit = () => {
    if (readOnly) return;
    const text = input.trim();
    // Allow submit when there is a pending file even without text.
    if (!pendingFile && !text) return;
    if (busy) return;
    if (!isAuthenticated) { setShowLoginModal(true); return; }

    if (pendingFile) {
      // Upload the staged file, passing any typed text as the prompt.
      onUpload(pendingFile, text || undefined);
      setPendingFile(null);
      setInput("");
      if (ref.current) ref.current.style.height = "auto";
      return;
    }

    if (!planMode) {
      // Plan mode off — always go directly to calculation update, never refine.
      onSendDirect(text);
    } else if (hasPendingProposal) {
      // Plan mode on + pending proposal — refine the existing proposal.
      onSend(text);
    } else {
      // Plan mode on, no proposal yet — create a new plan.
      onPlan(text);
    }
    setInput("");
    if (ref.current) ref.current.style.height = "auto";
  };

  const handleDragEnter = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    dragCounter.current++;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) pickFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = e.clipboardData?.files?.[0];
    if (file) {
      e.preventDefault();
      pickFile(file);
    }
  };

  const inactiveBtn = "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-400";

  const canSubmit = !readOnly && !busy && (!!input.trim() || !!pendingFile);

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className={`relative rounded-2xl transition-all duration-200 hover:scale-[1.01] ${isDragging ? "scale-[1.01]" : ""}`}>
        {/* Drop overlay — shown while dragging */}
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-blue-400 bg-blue-50/80 dark:bg-blue-950/60">
            <p className="text-sm font-semibold text-blue-600 dark:text-blue-300">Drop to upload</p>
          </div>
        )}
        <div className="pointer-events-none absolute -inset-0.5 rounded-2xl bg-blue-500 opacity-30 blur-md" />
        <div className={`relative rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 p-[1px] shadow-2xl shadow-blue-500/20 transition-all duration-200 ${isDragging ? "from-blue-400 to-blue-500 shadow-blue-400/40" : ""}`}>
          <div className="relative flex flex-col rounded-2xl bg-white dark:bg-black">
            {/* Pending file chip — shown between textarea and action bar */}
            {pendingFile && (
              <div className="flex items-center gap-2 px-3 pt-2">
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 dark:border-gray-700 dark:bg-gray-900">
                  {pendingPreviewUrl ? (
                    <img
                      src={pendingPreviewUrl}
                      alt={pendingFile.name}
                      className="h-8 w-8 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-100 dark:bg-blue-900">
                      <Paperclip className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                    </div>
                  )}
                  <span className="max-w-[160px] truncate text-xs font-medium text-gray-700 dark:text-gray-300">
                    {pendingFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={clearPendingFile}
                    aria-label="Remove attachment"
                    className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}

            {/* Top row — textarea only */}
            <div className="flex items-center">
              {/* Hidden file inputs */}
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                data-testid="input-file-upload"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) stageFile(file);
                  e.target.value = "";
                  setShowAttachMenu(false);
                }}
              />
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                data-testid="input-camera-upload"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) stageFile(file);
                  e.target.value = "";
                  setShowAttachMenu(false);
                }}
              />
              <textarea
                ref={ref}
                rows={1}
                value={idle ? typed : input}
                placeholder={idle ? "" : allProposalsDiscarded ? "All plans discarded — start a new prompt…" : hasPendingProposal ? "Describe a change to the plan…" : hasCalc ? "Ask a follow-up or change an assumption…" : pendingFile ? "Add context for this file (optional)…" : "Describe what you want to calculate"}
                onChange={(e) => { if (!readOnly) setInput(e.target.value); }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
                }}
                onPaste={handlePaste}
                readOnly={readOnly}
                className={`max-h-[300px] min-h-[44px] w-full flex-1 resize-none border-0 bg-transparent py-3 pl-4 pr-4 text-sm font-medium leading-6 focus:outline-none focus:ring-0 ${
                  idle ? "text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-white"
                }`}
                style={{ height: "44px", overflowY: "auto" }}
              />
            </div>

            {/* Bottom row — action buttons left, send right */}
            <div className="flex items-center justify-between px-2 pb-1.5">
              <div className="flex items-center gap-0.5">
                {/* Attach — with mobile action sheet */}
                <div ref={attachMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={handleAttachClick}
                    disabled={readOnly || busy || isUploading}
                    title="Attach a picture or PDF"
                    aria-label="Attach a picture or PDF"
                    data-testid="button-upload"
                    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-40 ${inactiveBtn}`}
                  >
                    {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                  </button>

                  {/* Mobile action sheet / popover */}
                  {showAttachMenu && isMobile && (
                    <div className="absolute bottom-full left-0 z-50 mb-1 flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                      <button
                        type="button"
                        onClick={() => { fileRef.current?.click(); }}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        <Paperclip className="h-4 w-4 text-gray-400" />
                        Choose file
                      </button>
                      <div className="h-px bg-gray-100 dark:bg-gray-800" />
                      <button
                        type="button"
                        onClick={() => { cameraRef.current?.click(); setShowAttachMenu(false); }}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        <Camera className="h-4 w-4 text-gray-400" />
                        Take photo
                      </button>
                    </div>
                  )}
                </div>

                {/* Web search */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => { if (!readOnly) onToggleWebSearch(); }}
                        disabled={readOnly}
                        aria-label="Toggle web search"
                        aria-pressed={webSearch}
                        data-testid="button-web-search"
                        className={`flex h-6 flex-shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold transition-colors ${
                          webSearch
                            ? "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300"
                            : inactiveBtn
                        }`}
                      >
                        <Globe className="h-3.5 w-3.5" />
                        {webSearch && <span>Web</span>}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px] text-center text-xs">
                      Web search — finds live references and cites real sources. Turn off to save tokens.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {/* Expert mode */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => { if (!readOnly) onToggleExpertMode(); }}
                        disabled={readOnly}
                        aria-label="Toggle Expert mode"
                        aria-pressed={expertMode}
                        data-testid="button-expert-mode"
                        className={`flex h-6 flex-shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold transition-colors ${
                          expertMode
                            ? "bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300"
                            : inactiveBtn
                        }`}
                      >
                        Expert
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[240px] text-center text-xs">
                      Expert mode — uses GPT-5.6 Sol for expert engineering-level precision and high-quality calculations.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* PhD mode */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => { if (!readOnly) onTogglePhdMode(); }}
                        disabled={readOnly}
                        aria-label="Toggle PhD mode"
                        aria-pressed={phdMode}
                        data-testid="button-phd-mode"
                        className={`flex h-6 flex-shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold transition-colors ${
                          phdMode
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            : inactiveBtn
                        }`}
                      >
                        PhD
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[240px] text-center text-xs">
                      PhD mode — uses GPT-6 Astra with high reasoning effort for the most demanding calculations and a PhD-level scientific approach. Slower and more expensive.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* Plan mode toggle — always visible so users can exit plan mode even with a pending proposal */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => { if (!readOnly) setPlanMode((p) => !p); }}
                        disabled={readOnly}
                        aria-label="Toggle plan mode"
                        aria-pressed={planMode}
                        data-testid="button-plan"
                        className={`flex h-6 flex-shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold transition-colors ${
                          planMode
                            ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                            : inactiveBtn
                        }`}
                      >
                        {isPlanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />}
                        <span>Plan</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[240px] text-center text-xs">
                      {planMode && hasPendingProposal
                        ? "Plan mode on — Send will refine the proposal"
                        : planMode
                        ? "Plan mode on — Send will create a reviewable plan instead of building directly"
                        : "Plan mode off — Send will update the calculation directly"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* Stop / Send */}
              {canStop && busy && onStop && !readOnly ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="group flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm transition-all hover:scale-105 hover:bg-red-700 active:scale-95"
                  aria-label="Stop generation"
                  data-testid="button-stop"
                >
                  <Square className="h-3 w-3 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit}
                  className={`group flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-white shadow-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-40 ${
                    planMode ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"
                  }`}
                  aria-label={planMode ? "Send plan" : "Send"}
                  data-testid="button-send"
                >
                  <ArrowUp className="h-3.5 w-3.5 stroke-[3] transition-transform group-hover:-translate-y-0.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[10px] text-gray-400 dark:text-gray-600">
        {readOnly ? "Historical calculation — read only" : "Drop a file or paste an image anywhere in the box"}
      </p>

      <LoginModal open={showLoginModal} onOpenChange={setShowLoginModal} />
    </div>
  );
}
