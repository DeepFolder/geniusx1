import { useRef, useEffect, useState } from "react";
import { FileText, Image as ImageIcon, Loader2, WandSparkles } from "lucide-react";
import { RichTextRenderer } from "@/components/chat/RichTextRenderer";
import { ProposalCard } from "./ProposalCard";
import { useBusyLabel } from "./useBusyLabel";
import type { BusyPhase, ChatMessage, GeniusAttachment, GeniusTaskProposal, GeniusCalculationExampleContext } from "./types";
import { OrbAnimation } from "@/features/deepsearch/components/ThinkingIndicator";
import { AnimatedBusyLabel } from "./AnimatedBusyLabel";

interface Props {
  messages: ChatMessage[];
  busyPhase: BusyPhase;
  webSearch: boolean;
  /** Set of message IDs whose proposals have been discarded. */
  discardedIds: Set<string>;
  isBuilding: boolean;
  isBusy: boolean;
  isCreatingExample: boolean;
  exampleCreatedIds: Set<string>;
  onApprove: (proposal: GeniusTaskProposal) => void;
  onDiscard: (messageId: string) => void;
  onCreateExample: (messageId: string, example: GeniusCalculationExampleContext) => void;
  readOnly?: boolean;
}

/**
 * Returns true when a ProposalCard should be rendered with its reply.
 * Proposals are never delayed by a text reveal.
 */
export function isProposalVisible(
  proposal: GeniusTaskProposal | null | undefined,
): proposal is GeniusTaskProposal {
  return !!proposal;
}

/**
 * Pure function modelling the animatingIdx update logic in AgentChat.
 * Given the previous latest assistant index and the new one, returns the
 * index that should animate (-1 if nothing new should animate).
 * Exported so tests can verify history-vs-new-message discrimination.
 */
export function resolveAnimatingIdx(
  prev: number,
  next: number,
): number {
  return next > prev ? next : -1;
}

function AttachmentChip({ attachment }: { attachment: GeniusAttachment }) {
  const Icon = attachment.kind === "pdf" ? FileText : ImageIcon;
  return (
    <span className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-white/15 px-2 py-1 text-[11px] font-medium">
      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="truncate">{attachment.name}</span>
      <span className="flex-shrink-0 opacity-70">{(attachment.size / 1024).toFixed(0)} KB</span>
    </span>
  );
}

interface AssistantMessageContentProps {
  msg: ChatMessage;
  discarded: boolean;
  isBuilding: boolean;
  isBusy: boolean;
  isCreatingExample: boolean;
  exampleCreatedIds: Set<string>;
  onApprove: (proposal: GeniusTaskProposal) => void;
  onDiscard: (messageId: string) => void;
  onCreateExample: (messageId: string, example: GeniusCalculationExampleContext) => void;
  readOnly: boolean;
}

function AssistantMessageContent({
  msg,
  discarded,
  isBuilding,
  isBusy,
  isCreatingExample,
  exampleCreatedIds,
  onApprove,
  onDiscard,
  onCreateExample,
  readOnly,
}: AssistantMessageContentProps) {
  return (
    <div className="text-sm leading-relaxed">
      <RichTextRenderer content={msg.content} hideReferences />
      {msg.calculationExample && !msg.proposal && (
        <div className="mt-3">
          {readOnly ? (
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              Calculation examples are unavailable while viewing a historical calculation.
            </p>
          ) : exampleCreatedIds.has(msg.id) ? (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              A reviewable calculation example was added below.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => onCreateExample(msg.id, msg.calculationExample!)}
              disabled={isBusy || isCreatingExample}
              data-testid="button-build-calculation-example"
              aria-label="Build calculation example from this explanation"
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/40"
            >
              {isCreatingExample ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />}
              {isCreatingExample ? "Preparing example…" : "Build calculation example"}
            </button>
          )}
        </div>
      )}
      {isProposalVisible(msg.proposal) && (
        <ProposalCard
          proposal={msg.proposal}
          discarded={discarded}
          isBuilding={isBuilding}
          onApprove={() => onApprove(msg.proposal!)}
          onDiscard={() => onDiscard(msg.id)}
           readOnly={readOnly}
        />
      )}
    </div>
  );
}

export function AgentChat({ messages, busyPhase, webSearch, discardedIds, isBuilding, isBusy, isCreatingExample, exampleCreatedIds, onApprove, onDiscard, onCreateExample, readOnly = false }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const busyLabel = useBusyLabel(busyPhase, webSearch);

  const latestAssistantIdx = messages.reduce((acc, m, i) => (m.role === "assistant" ? i : acc), -1);

  // Track the latest assistant index seen at mount so we only animate genuinely
  // new messages, not ones already in history (prevents re-animation on remount).
  const prevLatestRef = useRef(latestAssistantIdx);
  const [animatingIdx, setAnimatingIdx] = useState<number>(-1);

  useEffect(() => {
    if (latestAssistantIdx > prevLatestRef.current) {
      setAnimatingIdx(latestAssistantIdx);
    }
    prevLatestRef.current = latestAssistantIdx;
  }, [latestAssistantIdx]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 px-3.5 py-2 text-sm text-white shadow-sm"
                    : `max-w-[92%] rounded-2xl rounded-bl-sm bg-white dark:bg-[#1c2028] border border-gray-200 dark:border-white/[0.07] px-3.5 py-2 text-sm text-gray-800 dark:text-gray-100 shadow-sm${i === animatingIdx ? " chat-message-arrival" : ""}`
              }
            >
              {m.role === "assistant" ? (
                <AssistantMessageContent
                  msg={m}
                  discarded={discardedIds.has(m.id)}
                  isBuilding={isBuilding}
                  isBusy={isBusy}
                  isCreatingExample={isCreatingExample}
                  exampleCreatedIds={exampleCreatedIds}
                  onApprove={onApprove}
                  onDiscard={onDiscard}
                  onCreateExample={onCreateExample}
                  readOnly={readOnly}
                />
              ) : (
                <>
                  {m.content}
                  {m.attachment && <AttachmentChip attachment={m.attachment} />}
                </>
              )}
            </div>
          </div>
        ))}
        {busyLabel && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 px-1 py-1 text-sm text-gray-500 dark:text-gray-400">
              <OrbAnimation size={28} />
              <span
                key={busyLabel}
                className="busy-status-enter flex items-center text-xs"
                data-testid="text-busy-label"
                role="status"
                aria-live="polite"
                aria-label={busyLabel}
              >
                <AnimatedBusyLabel label={busyLabel} />
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
