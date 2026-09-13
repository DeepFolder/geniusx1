import { ClipboardList, Check, X, Loader2 } from "lucide-react";
import type { GeniusTaskProposal } from "./types";
import { RichTextRenderer } from "@/components/chat/RichTextRenderer";

interface Props {
  proposal: GeniusTaskProposal;
  /** When true, this proposal has been explicitly discarded — action buttons are replaced by a muted label. */
  discarded?: boolean;
  isBuilding: boolean;
  onApprove: () => void;
  onDiscard: () => void;
  readOnly?: boolean;
}

function Field({
  label,
  children,
  contentClassName = "text-xs",
}: {
  label: string;
  children: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </div>
      <div className={`mt-0.5 leading-relaxed text-gray-700 dark:text-gray-300 ${contentClassName}`}>{children}</div>
    </div>
  );
}

// A reviewable "calculation task" card the assistant proposes after reading an
// uploaded document. The user can request changes in chat or approve to build.
export function ProposalCard({ proposal, discarded, isBuilding, onApprove, onDiscard, readOnly = false }: Props) {
  return (
    <div className={`mt-2 space-y-2.5 rounded-xl border p-3 transition-colors ${
      discarded
        ? "border-gray-200 bg-gray-50/60 dark:border-gray-700 dark:bg-gray-900/30 opacity-60"
        : "border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30"
    }`}>
      <div className="flex items-center gap-1.5">
        <ClipboardList className={`h-3.5 w-3.5 ${discarded ? "text-gray-400 dark:text-gray-500" : "text-blue-600 dark:text-blue-400"}`} />
        <span className="text-xs font-bold text-gray-900 dark:text-white">{proposal.title}</span>
      </div>

      {proposal.understanding && (
        <Field label="What I understood">
          <RichTextRenderer content={proposal.understanding} hideReferences />
        </Field>
      )}
      {proposal.problem && (
        <Field label="Problem to solve">
          <RichTextRenderer content={proposal.problem} hideReferences />
        </Field>
      )}

      {proposal.inputs.length > 0 && (
        <Field label="Key inputs">
          <ul className="space-y-0.5">
            {proposal.inputs.map((inp, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>{inp.label}</span>
                <span className="font-mono text-gray-900 dark:text-gray-100">
                  {inp.value || "—"} {inp.unit}
                </span>
              </li>
            ))}
          </ul>
        </Field>
      )}

      {proposal.assumptions.length > 0 && (
        <Field label="Assumptions">
          <ul className="list-disc space-y-0.5 pl-4">
            {proposal.assumptions.map((a, i) => (
              <li key={i}>
                <RichTextRenderer content={a} hideReferences />
              </li>
            ))}
          </ul>
        </Field>
      )}

      {proposal.approach && (
        <Field
          label="Approach"
          contentClassName="text-sm [&_.katex-block]:my-2 [&_.katex-block]:overflow-x-auto"
        >
          <RichTextRenderer content={proposal.approach} hideReferences />
        </Field>
      )}

      {discarded || readOnly ? (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 pt-1">
          {readOnly ? "Proposal actions are unavailable while viewing a historical calculation." : "This plan was discarded."}
        </p>
      ) : (
        <>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onApprove}
              disabled={isBuilding}
              data-testid="button-approve-proposal"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
            >
              {isBuilding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {isBuilding ? "Building…" : "Approve & build"}
            </button>
            <button
              type="button"
              onClick={onDiscard}
              disabled={isBuilding}
              data-testid="button-discard-proposal"
              className="flex items-center justify-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <X className="h-3.5 w-3.5" />
              Discard
            </button>
          </div>
          {!isBuilding && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Want changes? Just type them below — I'll update the task.
            </p>
          )}
        </>
      )}
    </div>
  );
}
