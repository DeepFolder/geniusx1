import { useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, CircleHelp, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { RichTextRenderer, normalizeMathUnicode } from "@/components/chat/RichTextRenderer";
import {
  SymbolMath,
  UnitMath,
  engineeringSymbolToLatex,
  normalizeEngineeringLatexSymbols,
} from "@/components/chat/MathHelpers";
import type { GeniusStep, GeniusResult, GeniusStepComment } from "./types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatGeniusNumber } from "@shared/genius-number-format";

// ---------------------------------------------------------------------------
// LaTeX helpers
// ---------------------------------------------------------------------------
/** Strip outer delimiters (\[…\], \(…\), $$…$$, $…$) and return the raw inner LaTeX. */
function stripDelimiters(latex: string): string {
  const t = latex.trim();
  if (t.startsWith("\\[") && t.endsWith("\\]")) return t.slice(2, -2).trim();
  if (t.startsWith("\\(") && t.endsWith("\\)")) return t.slice(2, -2).trim();
  if (t.startsWith("$$") && t.endsWith("$$")) return t.slice(2, -2).trim();
  if (t.startsWith("$") && t.endsWith("$") && t.length > 2) return t.slice(1, -1).trim();
  return t;
}

/** Convert e-notation to LaTeX ×10ⁿ form, e.g. 1.333e-08 → 1.333 \times 10^{-8} */
function eNotationToLatex(s: string): string {
  return s.replace(/([+-]?\d+(?:\.\d+)?)[eE]([+-]?\d+)/g, (_, mantissa, exp) => {
    const e = parseInt(exp, 10);
    return `${mantissa} \\times 10^{${e}}`;
  });
}

/**
 * Split a LaTeX string on top-level "=" signs (i.e. not inside `{...}` groups)
 * and return the trimmed, non-empty segments in order.
 *
 * The AI-generated `formula` / `calculation` fields are not guaranteed to be
 * bare RHS expressions — they sometimes come back as full equations
 * ("v = \frac{v_{max}}{3.6}") and the calculation can even embed its own
 * trailing numeric answer ("v = \frac{200}{3.6} = 55.56"). Splitting lets the
 * caller detect and de-duplicate that shape instead of blindly concatenating
 * strings that already contain their own "lhs =" / "= result" parts.
 */
function splitTopLevelEquals(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of s) {
    if (ch === "{") depth++;
    else if (ch === "}") depth = Math.max(0, depth - 1);

    if (ch === "=" && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current.trim());
  return parts.filter((p) => p.length > 0);
}

/** Best-effort leading numeric value of a LaTeX segment, or null if none. */
function parseLeadingNumber(s: string): number | null {
  const m = s.trim().match(/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * True when `candidate` is the same numeric value as `result`, allowing for a
 * power-of-ten scale difference (e.g. calc embeds "1020.83" in base units
 * while step.result is "1.021" after SI-prefix scaling to kN).
 */
function isRedundantResult(candidate: string, result: string): boolean {
  const c = parseLeadingNumber(candidate);
  const r = parseLeadingNumber(result);
  if (c === null || r === null) return false;
  if (c === 0 || r === 0) return c === r;
  const ratio = Math.abs(c / r);
  const exponent = Math.round(Math.log10(ratio));
  const scale = Math.pow(10, exponent);
  return Math.abs(ratio / scale - 1) < 0.05;
}

/**
 * Build the combined and fallback display-math strings for one calculation step:
 *
 *   symbolicLine  →  F = m \times g
 *   numericLine   →  F = 10 \times 9.81 \approx 98.1\;\mathrm{N}
 *
 * When only one of the two is available the other is null and the caller
 * renders a single row (no regression for steps with only formula or only
 * calculation). The result suffix (≈ …) is always on the numeric row; the
 * symbolic row is intentionally left clean of numbers.
 *
 * `formula` and `calculation` may each be a bare RHS expression or a full
 * "symbol = expression" equation (and `calculation` may further embed its own
 * trailing result). Every segment is split on top-level "=" signs so a shared
 * leading symbol and a redundant trailing result are deduplicated.
 */
interface MathLines {
  combinedLine: string | null;
  symbolicLine: string | null;
  numericLine: string | null;
}

function buildMathLines(step: GeniusStep, displayDecimals?: number): MathLines {
  // Strip a leading \displaystyle the AI sometimes prepends — buildMathLines
  // adds it back via the \[\displaystyle …\] wrapper, and leaving it in causes
  // the lhs to become "\displaystyle symbol" instead of just "symbol".
  const stripDisplaystyle = (s: string) => s.replace(/^\\displaystyle\s*/g, "");

  const rawFormula = normalizeEngineeringLatexSymbols(
    stripDisplaystyle(stripDelimiters(step.formula?.trim() ?? "")),
  );
  const rawCalc = normalizeEngineeringLatexSymbols(
    stripDisplaystyle(stripDelimiters(step.calculation?.trim() ?? "")),
  );

  const hasFormula = rawFormula.length > 0;
  const hasCalc = rawCalc.length > 0 && rawCalc !== rawFormula;
  const hasResult =
    !!step.result && step.result !== "—" && step.result !== "-" && step.result.trim() !== "";

  // Build the result suffix, e.g.  5.15 \times 10^{4}\;\mathrm{mm^4}
  // Unit is run through the same Unicode-symbol normalization the KaTeX
  // renderer applies elsewhere (Ω, µ, °, ohm) so it matches how the same
  // symbol renders in the formula itself instead of breaking inside \mathrm{}.
  const formattedResult = hasResult
    ? formatGeniusNumber(step.result!, displayDecimals)
    : null;
  const resultLatex = formattedResult
    ? eNotationToLatex(formattedResult) + (step.unit ? `\\;\\mathrm{${normalizeMathUnicode(step.unit)}}` : "")
    : null;

  const formulaParts = hasFormula ? splitTopLevelEquals(rawFormula) : [];
  const calcParts = hasCalc ? splitTopLevelEquals(rawCalc) : [];

  // A leading segment is treated as the shared "lhs =" symbol only when the
  // string actually contained an "=" (length > 1); a bare expression has no lhs.
  const formulaLhs = formulaParts.length > 1 ? formulaParts[0] : null;
  let formulaRhsParts =
    formulaParts.length > 1 ? formulaParts.slice(1) : formulaParts.slice();

  // Drop a trailing segment in the formula that just restates the canonical
  // result so we never render it twice.
  if (hasResult && formulaRhsParts.length > 1) {
    const last = formulaRhsParts[formulaRhsParts.length - 1];
    if (isRedundantResult(last, step.result!)) {
      formulaRhsParts = formulaRhsParts.slice(0, -1);
    }
  }
  // Also drop a trailing "\approx <result>" tail the AI sometimes appends to
  // the formula field — e.g. "... \approx 10.56\;\mathrm{%}" — because
  // buildMathLines appends its own "≈ result" suffix from step.result.
  if (hasResult && formulaRhsParts.length > 0) {
    const last = formulaRhsParts[formulaRhsParts.length - 1];
    const approxTail = last.match(/\\approx\s*(.+)$/s);
    if (approxTail && isRedundantResult(approxTail[1].trim(), step.result!)) {
      const trimmed = last.slice(0, last.lastIndexOf("\\approx")).trim();
      if (trimmed.length > 0) {
        formulaRhsParts = [...formulaRhsParts.slice(0, -1), trimmed];
      } else {
        formulaRhsParts = formulaRhsParts.slice(0, -1);
      }
    }
  }
  const formulaRhs = formulaRhsParts.length ? formulaRhsParts.join(" = ") : null;

  const calcLhs = calcParts.length > 1 ? calcParts[0] : null;
  let calcRhsParts = calcParts.length > 1 ? calcParts.slice(1) : calcParts.slice();

  // Drop a trailing segment that just restates the canonical result so we
  // never render it twice (once inline, once via the "≈ result" suffix).
  if (hasResult && calcRhsParts.length > 1) {
    const last = calcRhsParts[calcRhsParts.length - 1];
    if (isRedundantResult(last, step.result!)) {
      calcRhsParts = calcRhsParts.slice(0, -1);
    }
  }
  const calcRhs = calcRhsParts.length ? calcRhsParts.join(" = ") : null;

  // When neither the formula nor the calculation string contains an "=" sign,
  // the AI returned a bare RHS expression. Fall back to step.symbol so the
  // displayed equation always reads  "P = ..." rather than just "...".
  const stepSymbol = step.symbol
    ? engineeringSymbolToLatex(stripDelimiters(step.symbol.trim()))
    : null;
  const lhs = formulaLhs ?? calcLhs ?? stepSymbol;

  const bothExist = formulaRhs !== null && calcRhs !== null && calcRhs !== formulaRhs;

  // Always build the single-row chain first. The component compares the
  // rendered KaTeX width with the live Step-cell width to decide whether to
  // show it or the two-line fallback; raw LaTeX length is not a visual metric.
  const singleRhs = formulaRhs ?? calcRhs;
  if (!singleRhs && !lhs) {
    return { combinedLine: null, symbolicLine: null, numericLine: null };
  }

  const segments: string[] = [];
  if (lhs) segments.push(lhs);
  if (singleRhs) segments.push(singleRhs);
  if (bothExist && calcRhs !== singleRhs) segments.push(calcRhs!);
  const chain = segments.join(" = ");
  const fullChain = resultLatex ? `${chain} \\approx ${resultLatex}` : chain;
  const combinedLine = `\\[\\displaystyle ${fullChain}\\]`;

  if (!bothExist) {
    return { combinedLine, symbolicLine: null, numericLine: null };
  }

  // Row 1 — symbolic: lhs = formulaRhs (no numbers, no result suffix).
  const symSegments: string[] = [];
  if (lhs) symSegments.push(lhs);
  symSegments.push(formulaRhs!);
  const symbolicLine = `\\[\\displaystyle ${symSegments.join(" = ")}\\]`;

  // Row 2 — numeric: lhs = calcRhs ≈ result.
  const numSegments: string[] = [];
  if (lhs) numSegments.push(lhs);
  numSegments.push(calcRhs!);
  const numChain = numSegments.join(" = ");
  const numInner = resultLatex ? `${numChain} \\approx ${resultLatex}` : numChain;
  const numericLine = `\\[\\displaystyle ${numInner}\\]`;

  return { combinedLine, symbolicLine, numericLine };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Keeps a single continuous equation whenever its rendered KaTeX glyphs fit
 * in the current Step column. A hidden, intrinsic-width copy remains mounted
 * while the fallback is visible so panel and viewport resize can restore the
 * compact layout without waiting for another calculation render.
 */
function ResponsiveStepMath({ lines }: { lines: MathLines }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measurementRef = useRef<HTMLDivElement>(null);
  const [isStacked, setIsStacked] = useState(false);
  const canStack = !!lines.symbolicLine && !!lines.numericLine;

  useLayoutEffect(() => {
    if (!canStack) {
      setIsStacked(false);
      return;
    }

    const measure = () => {
      const availableWidth = containerRef.current?.getBoundingClientRect().width ?? 0;
      const renderedEquation = measurementRef.current?.querySelector<HTMLElement>(".katex");
      const equationWidth = renderedEquation?.getBoundingClientRect().width ?? 0;

      // Avoid selecting the fallback until both elements have a meaningful
      // layout, then leave a one-pixel tolerance for subpixel rounding.
      if (availableWidth > 0 && equationWidth > 0) {
        const nextIsStacked = equationWidth > availableWidth + 1;
        setIsStacked((current) => (current === nextIsStacked ? current : nextIsStacked));
      }
    };

    measure();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(measure);
    if (containerRef.current) observer?.observe(containerRef.current);

    window.addEventListener("resize", measure);
    window.addEventListener("beforeprint", measure);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("beforeprint", measure);
    };
  }, [canStack, lines.combinedLine]);

  if (!lines.combinedLine) return null;

  return (
    <div ref={containerRef} className="step-math-layout text-sm">
      {/* This copy supplies an intrinsic rendered width even while the visible
          equation uses the two-line fallback. */}
      {canStack && (
        <div ref={measurementRef} className="step-math-measure" aria-hidden="true">
          <RichTextRenderer content={lines.combinedLine} hideReferences />
        </div>
      )}
      <div className="step-math-screen">
        {isStacked && canStack ? (
          <>
            <RichTextRenderer content={lines.symbolicLine!} hideReferences />
            <RichTextRenderer content={lines.numericLine!} hideReferences />
          </>
        ) : (
          <RichTextRenderer content={lines.combinedLine} hideReferences />
        )}
      </div>

      {/* Native PDF printing has a fixed A4 width, unlike the resizable
          worksheet panel. Always print the symbolic and substituted equation
          on separate lines so neither half is clipped by the table cell. */}
      <div className="step-math-print">
        {canStack ? (
          <>
            <RichTextRenderer content={lines.symbolicLine!} hideReferences />
            <RichTextRenderer content={lines.numericLine!} hideReferences />
          </>
        ) : (
          <RichTextRenderer content={lines.combinedLine} hideReferences />
        )}
      </div>
    </div>
  );
}

interface StepsViewProps {
  steps: GeniusStep[];
  /** Pass the results array to render the governing-result summary row. */
  results?: GeniusResult[];
  displayDecimals?: number;
  onExplainStep?: (step: GeniusStep) => void;
  isExplaining?: boolean;
  readOnly?: boolean;
  comments?: GeniusStepComment[];
  onAddComment?: (stepId: string, content: string) => Promise<unknown>;
  isSavingComment?: boolean;
  onUpdateComment?: (stepId: string, commentId: number, content: string) => Promise<unknown>;
  onDeleteComment?: (stepId: string, commentId: number) => Promise<unknown>;
  isUpdatingComment?: boolean;
  isDeletingComment?: boolean;
}

export function StepsView({
  steps,
  results,
  displayDecimals,
  onExplainStep,
  isExplaining = false,
  readOnly = false,
  comments = [],
  onAddComment,
  isSavingComment = false,
  onUpdateComment,
  onDeleteComment,
  isUpdatingComment = false,
  isDeletingComment = false,
}: StepsViewProps) {
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [commentingStepId, setCommentingStepId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentErrors, setCommentErrors] = useState<Record<string, string>>({});
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);

  if (!steps.length) return null;

  const toggleNotes = (stepId: string) => {
    setExpandedNotes((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  const beginComment = (stepId: string) => {
    setEditingCommentId(null);
    setCommentingStepId(stepId);
    setExpandedNotes((prev) => ({ ...prev, [stepId]: true }));
    setCommentErrors((prev) => ({ ...prev, [stepId]: "" }));
  };

  const beginEditComment = (comment: GeniusStepComment) => {
    setCommentingStepId(comment.stepId);
    setEditingCommentId(comment.id);
    setCommentDrafts((prev) => ({ ...prev, [comment.stepId]: comment.content }));
    setCommentErrors((prev) => ({ ...prev, [comment.stepId]: "" }));
    setExpandedNotes((prev) => ({ ...prev, [comment.stepId]: true }));
  };

  const cancelComment = (stepId: string) => {
    setCommentingStepId(null);
    setEditingCommentId(null);
    setCommentDrafts((prev) => ({ ...prev, [stepId]: "" }));
    setCommentErrors((prev) => ({ ...prev, [stepId]: "" }));
  };

  const saveComment = async (stepId: string) => {
    const content = (commentDrafts[stepId] ?? "").trim();
    if (!content) {
      setCommentErrors((prev) => ({ ...prev, [stepId]: "Enter a comment before saving." }));
      return;
    }
    if (content.length > 2000) {
      setCommentErrors((prev) => ({ ...prev, [stepId]: "Comments must be 2,000 characters or fewer." }));
      return;
    }
    try {
      if (editingCommentId !== null) {
        await onUpdateComment?.(stepId, editingCommentId, content);
      } else {
        await onAddComment?.(stepId, content);
      }
      setCommentingStepId(null);
      setEditingCommentId(null);
      setCommentDrafts((prev) => ({ ...prev, [stepId]: "" }));
      setCommentErrors((prev) => ({ ...prev, [stepId]: "" }));
    } catch (err) {
      setCommentErrors((prev) => ({
        ...prev,
        [stepId]: err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Could not save comment. Please try again.",
      }));
    }
  };

  // Pick a governing result for the summary row.
  // Priority: last step that has a symbol + result (the terminal calculation),
  // then fall back to the first entry in the results array.
  const lastStep = steps.length > 0 ? steps[steps.length - 1] : null;
  const lastStepHasResult =
    lastStep &&
    !!lastStep.result &&
    lastStep.result !== "—" &&
    lastStep.result !== "-" &&
    lastStep.result.trim() !== "";

  const governing: { symbol?: string; label?: string; value: string; unit?: string } | null =
    lastStepHasResult && lastStep.symbol
      ? { symbol: lastStep.symbol, value: lastStep.result, unit: lastStep.unit }
      : lastStepHasResult
        ? { label: lastStep?.title, value: lastStep!.result, unit: lastStep!.unit }
        : results && results.length > 0
          ? { symbol: results[0].symbol, label: results[0].label, value: results[0].value, unit: results[0].unit }
          : null;

  return (
    <div className="worksheet-table-scroll worksheet-table-scroll--wide -mx-1 px-1">
    <table className="w-full border-collapse table-fixed">
      <colgroup>
        {/* # column — fixed narrow */}
        <col className="w-6" />
        {/* Step + formula column — takes remaining space */}
        <col />
        {/* Result column — fixed width so formula cell never gets squeezed off-screen */}
        <col className="w-24" />
      </colgroup>
      <thead>
        <tr className="border-b-2 border-gray-300 dark:border-gray-600">
          <th className="text-left py-1.5 pr-3 font-semibold text-gray-500 dark:text-gray-400 w-6 text-xs">#</th>
          <th className="text-left py-1.5 pr-3 font-semibold text-gray-500 dark:text-gray-400 text-xs">Step</th>
          <th className="text-right py-1.5 font-semibold text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">Result</th>
        </tr>
      </thead>
      <tbody>
        {steps.map((step, i) => {
          const mathLines = buildMathLines(step, displayDecimals);
          const hasResult =
            !!step.result &&
            step.result !== "—" &&
            step.result !== "-" &&
            step.result.trim() !== "";

          return (
            <tr
              key={step.id}
              id={`step-${step.id}`}
              className="border-b border-gray-200/90 dark:border-white/[0.08] last:border-b-0 result-row-reveal scroll-mt-4"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {/* Step number */}
              <td className="py-1.5 pr-3 text-gray-400 dark:text-gray-500 font-semibold tabular-nums align-top text-xs">
                {i + 1}
              </td>

              {/* Title + single merged math line */}
              <td className="py-1.5 pr-4 align-top min-w-0 step-formula-cell">
                <div className="flex items-baseline gap-1 mb-0.5">
                  <div className="font-semibold text-xs text-gray-800 dark:text-gray-200 leading-tight">
                    {step.title}
                  </div>
                  {step.sources && step.sources.length > 0 && (
                    <div className="flex gap-1">
                      {step.sources.map((s) => (
                        <span
                          key={s}
                          className="text-[10px] font-medium text-blue-500 dark:text-blue-400"
                        >
                          [{s}]
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <ResponsiveStepMath lines={mathLines} />

                {(() => {
                  const hasDescription = !!step.description;
                  const hasWarnings = !!step.warnings && step.warnings.length > 0;
                  const stepComments = comments.filter((comment) => comment.stepId === step.id);
                  const hasNotes = hasDescription || hasWarnings || stepComments.length > 0 || (!readOnly && !!onAddComment);

                  const noteColorClass = hasWarnings
                    ? "text-amber-500 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300"
                    : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300";

                  const isExpanded = !!expandedNotes[step.id];

                  return (
                    <div className="mt-1">
                      <div data-print-hide="true" className="flex items-center gap-2">
                        {/* Toggle button — hidden in print (notes are always shown there) */}
                        {hasNotes && (
                          <button
                            type="button"
                            onClick={() => toggleNotes(step.id)}
                            aria-expanded={isExpanded}
                            className={`step-notes-toggle inline-flex items-center gap-1 text-[11px] font-medium transition-colors ${noteColorClass}`}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                            Notes
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => { if (!readOnly) onExplainStep?.(step); }}
                          disabled={!onExplainStep || isExplaining || readOnly}
                          aria-label={`Explain ${step.title} in chat`}
                          title="Explain this step in chat"
                          className="inline-flex h-6 w-6 items-center justify-center rounded text-emerald-600 transition-colors hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-emerald-400 dark:hover:text-emerald-300"
                        >
                          <CircleHelp aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Content always in DOM so @media print can force it visible */}
                      {hasNotes && (
                      <div className={`step-notes-content mt-1 ${isExpanded ? "animate-in fade-in slide-in-from-top-1 duration-150" : "hidden"}`}>
                        {hasDescription && (
                          <div className="text-gray-500 dark:text-gray-400 text-xs leading-snug">
                            <RichTextRenderer content={step.description!} hideReferences />
                          </div>
                        )}

                        {step.warnings?.map((w, wi) => (
                          <div
                            key={wi}
                            className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"
                          >
                            <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0 text-amber-500" />
                            <span>{w}</span>
                          </div>
                        ))}
                        {!readOnly && onAddComment && commentingStepId !== step.id && (
                          <div data-print-hide="true" className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => beginComment(step.id)}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 transition-colors hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              <Plus aria-hidden="true" className="h-3 w-3" />
                              Add comment
                            </button>
                          </div>
                        )}
                        {!readOnly && onAddComment && commentingStepId === step.id && (
                          <div data-print-hide="true" className="mt-2 rounded-md border border-gray-200 bg-white p-2 dark:border-white/[0.12] dark:bg-black/20">
                            <label htmlFor={`step-comment-${step.id}`} className="sr-only">Comment on {step.title}</label>
                            <textarea
                              id={`step-comment-${step.id}`}
                              value={commentDrafts[step.id] ?? ""}
                              onChange={(event) => {
                                setCommentDrafts((prev) => ({ ...prev, [step.id]: event.target.value }));
                                setCommentErrors((prev) => ({ ...prev, [step.id]: "" }));
                              }}
                              maxLength={2001}
                              rows={3}
                              aria-describedby={commentErrors[step.id] ? `step-comment-error-${step.id}` : undefined}
                              aria-invalid={!!commentErrors[step.id]}
                              placeholder="Add an engineering note…"
                              className="w-full resize-y rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/[0.16] dark:bg-[#161a22] dark:text-gray-100"
                            />
                            {commentErrors[step.id] && (
                              <p id={`step-comment-error-${step.id}`} role="alert" className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                                {commentErrors[step.id]}
                              </p>
                            )}
                            <div className="mt-2 flex items-center gap-2">
                              <button type="button" onClick={() => saveComment(step.id)} disabled={isSavingComment || isUpdatingComment}
                                className="flex h-6 items-center rounded-lg bg-blue-600 px-2 text-[11px] font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
                                {isSavingComment || isUpdatingComment ? "Saving…" : "Save"}
                              </button>
                              <button type="button" onClick={() => cancelComment(step.id)} disabled={isSavingComment || isUpdatingComment}
                                className="flex h-6 items-center rounded-lg px-2 text-[11px] font-semibold text-gray-600 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:text-white">
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                        {commentErrors[step.id] && commentingStepId !== step.id && (
                          <p role="alert" className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                            {commentErrors[step.id]}
                          </p>
                        )}
                        {stepComments.length > 0 && (
                          <div className="mt-2 space-y-1.5 border-t border-gray-200 pt-2 dark:border-white/[0.1]">
                            {stepComments.map((comment) => (
                              <div
                                key={comment.id}
                                className="flex items-start gap-2"
                              >
                                <p className="min-w-0 flex-1 select-text text-xs leading-snug text-gray-700 dark:text-gray-300">
                                  {comment.content}
                                </p>
                                {!readOnly && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild disabled={isSavingComment || isUpdatingComment || isDeletingComment}>
                                      <button
                                        type="button"
                                        data-comment-actions="true"
                                        data-print-hide="true"
                                        aria-label={`Comment options for ${step.title}`}
                                        title="Comment options"
                                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
                                      >
                                        <MoreHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="min-w-28">
                                      {onUpdateComment && (
                                        <DropdownMenuItem onSelect={() => beginEditComment(comment)}>
                                          <Pencil aria-hidden="true" className="mr-2 h-3.5 w-3.5" />
                                          Edit
                                        </DropdownMenuItem>
                                      )}
                                      {onDeleteComment && (
                                        <DropdownMenuItem
                                          onSelect={() => {
                                            onDeleteComment(step.id, comment.id).catch((err) => {
                                              setCommentErrors((prev) => ({
                                                ...prev,
                                                [step.id]: err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Could not delete comment. Please try again.",
                                              }));
                                            });
                                          }}
                                          className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                                        >
                                          <Trash2 aria-hidden="true" className="mr-2 h-3.5 w-3.5" />
                                          Delete
                                        </DropdownMenuItem>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      )}
                    </div>
                  );
                })()}

              </td>

              {/* Numeric result — right column */}
              <td className="py-1.5 text-right whitespace-nowrap align-top">
                {hasResult && (
                  <>
                    <span className="font-mono text-gray-900 dark:text-white text-xs">
                      {formatGeniusNumber(step.result!, displayDecimals)}
                    </span>
                    {step.unit ? (
                      <span className="ml-1 font-sans font-normal text-gray-500 dark:text-gray-400 text-xs">
                        <UnitMath unit={step.unit} />
                      </span>
                    ) : null}
                  </>
                )}
              </td>
            </tr>
          );
        })}

        {/* Summary row — governing result */}
        {governing && (
          <tr className="border-t-2 border-gray-300 dark:border-gray-600">
            {/* Empty # cell */}
            <td className="py-1.5 pr-3" />

            {/* Governing symbol */}
            <td className="py-1.5 pr-4">
              {governing.symbol ? (
                  <span className="text-xs text-gray-700 dark:text-gray-300">
                    <SymbolMath content={stripDelimiters(governing.symbol)} />
                  </span>
              ) : (
                <span className="font-semibold text-xs text-gray-700 dark:text-gray-300">
                  {governing.label}
                </span>
              )}
            </td>

            {/* Governing value + unit */}
            <td className="py-1.5 text-right whitespace-nowrap align-middle">
              <span className="font-mono font-semibold text-gray-900 dark:text-white text-xs">
                {formatGeniusNumber(governing.value, displayDecimals)}
              </span>
              {governing.unit ? (
                <span className="ml-1 font-sans font-normal text-gray-500 dark:text-gray-400 text-xs">
                  <UnitMath unit={governing.unit} />
                </span>
              ) : null}
            </td>
          </tr>
        )}
      </tbody>
    </table>
    </div>
  );
}
function StepsViewSuperseded({ steps, results, onExplainStep, isExplaining = false }: StepsViewProps) {
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  if (!steps.length) return null;

  const toggleNotes = (stepId: string) => {
    setExpandedNotes((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  // Pick a governing result for the summary row.
  // Priority: last step that has a symbol + result (the terminal calculation),
  // then fall back to the first entry in the results array.
  const lastStep = steps.length > 0 ? steps[steps.length - 1] : null;
  const lastStepHasResult =
    lastStep &&
    !!lastStep.result &&
    lastStep.result !== "—" &&
    lastStep.result !== "-" &&
    lastStep.result.trim() !== "";

  const governing: { symbol?: string; label?: string; value: string; unit?: string } | null =
    lastStepHasResult && lastStep.symbol
      ? { symbol: lastStep.symbol, value: lastStep.result, unit: lastStep.unit }
      : lastStepHasResult
        ? { label: lastStep?.title, value: lastStep!.result, unit: lastStep!.unit }
        : results && results.length > 0
          ? { symbol: results[0].symbol, label: results[0].label, value: results[0].value, unit: results[0].unit }
          : null;

  return (
    <div className="worksheet-table-scroll worksheet-table-scroll--wide -mx-1 px-1">
    <table className="w-full border-collapse table-fixed">
      <colgroup>
        {/* # column — fixed narrow */}
        <col className="w-6" />
        {/* Step + formula column — takes remaining space */}
        <col />
        {/* Result column — fixed width so formula cell never gets squeezed off-screen */}
        <col className="w-24" />
      </colgroup>
      <thead>
        <tr className="border-b-2 border-gray-300 dark:border-gray-600">
          <th className="text-left py-1.5 pr-3 font-semibold text-gray-500 dark:text-gray-400 w-6 text-xs">#</th>
          <th className="text-left py-1.5 pr-3 font-semibold text-gray-500 dark:text-gray-400 text-xs">Step</th>
          <th className="text-right py-1.5 font-semibold text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">Result</th>
        </tr>
      </thead>
      <tbody>
        {steps.map((step, i) => {
          const mathLines = buildMathLines(step, displayDecimals);
          const hasResult =
            !!step.result &&
            step.result !== "—" &&
            step.result !== "-" &&
            step.result.trim() !== "";

          return (
            <tr
              key={step.id}
              id={`step-${step.id}`}
              className="border-b border-gray-200/90 dark:border-white/[0.08] last:border-b-0 result-row-reveal scroll-mt-4"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {/* Step number */}
              <td className="py-1.5 pr-3 text-gray-400 dark:text-gray-500 font-semibold tabular-nums align-top text-xs">
                {i + 1}
              </td>

              {/* Title + single merged math line */}
              <td className="py-1.5 pr-4 align-top min-w-0 step-formula-cell">
                <div className="flex items-baseline gap-1 mb-0.5">
                  <div className="font-semibold text-xs text-gray-800 dark:text-gray-200 leading-tight">
                    {step.title}
                  </div>
                  {step.sources && step.sources.length > 0 && (
                    <div className="flex gap-1">
                      {step.sources.map((s) => (
                        <span
                          key={s}
                          className="text-[10px] font-medium text-blue-500 dark:text-blue-400"
                        >
                          [{s}]
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <ResponsiveStepMath lines={mathLines} />

                {(() => {
                  const hasDescription = !!step.description;
                  const hasWarnings = !!step.warnings && step.warnings.length > 0;

                  const noteColorClass = hasWarnings
                    ? "text-amber-500 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300"
                    : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300";

                  const isExpanded = !!expandedNotes[step.id];

                  return (
                    <div className="mt-1">
                      <div data-print-hide="true" className="flex items-center gap-2">
                        {/* Toggle button — hidden in print (notes are always shown there) */}
                        {(hasDescription || hasWarnings) && (
                          <button
                            type="button"
                            onClick={() => toggleNotes(step.id)}
                            aria-expanded={isExpanded}
                            className={`step-notes-toggle inline-flex items-center gap-1 text-[11px] font-medium transition-colors ${noteColorClass}`}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                            Notes
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onExplainStep?.(step)}
                          disabled={!onExplainStep || isExplaining}
                          aria-label={`Explain ${step.title} in chat`}
                          title="Explain this step in chat"
                          className="inline-flex h-4 w-4 items-center justify-center rounded text-gray-400 transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-500 dark:hover:text-blue-400"
                        >
                          <CircleHelp aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Content always in DOM so @media print can force it visible */}
                      {(hasDescription || hasWarnings) && (
                      <div className={`step-notes-content mt-1 ${isExpanded ? "animate-in fade-in slide-in-from-top-1 duration-150" : "hidden"}`}>
                        {hasDescription && (
                          <div className="text-gray-500 dark:text-gray-400 text-xs leading-snug">
                            <RichTextRenderer content={step.description!} hideReferences />
                          </div>
                        )}

                        {step.warnings?.map((w, wi) => (
                          <div
                            key={wi}
                            className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"
                          >
                            <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0 text-amber-500" />
                            <span>{w}</span>
                          </div>
                        ))}
                      </div>
                      )}
                    </div>
                  );
                })()}

              </td>

              {/* Numeric result — right column */}
              <td className="py-1.5 text-right whitespace-nowrap align-top">
                {hasResult && (
                  <>
                    <span className="font-mono text-gray-900 dark:text-white text-xs">
                      {formatGeniusNumber(step.result!, displayDecimals)}
                    </span>
                    {step.unit ? (
                      <span className="ml-1 font-sans font-normal text-gray-500 dark:text-gray-400 text-xs">
                        <UnitMath unit={step.unit} />
                      </span>
                    ) : null}
                  </>
                )}
              </td>
            </tr>
          );
        })}

        {/* Summary row — governing result */}
        {governing && (
          <tr className="border-t-2 border-gray-300 dark:border-gray-600">
            {/* Empty # cell */}
            <td className="py-1.5 pr-3" />

            {/* Governing symbol */}
            <td className="py-1.5 pr-4">
              {governing.symbol ? (
                  <span className="text-xs text-gray-700 dark:text-gray-300">
                    <SymbolMath content={stripDelimiters(governing.symbol)} />
                  </span>
              ) : (
                <span className="font-semibold text-xs text-gray-700 dark:text-gray-300">
                  {governing.label}
                </span>
              )}
            </td>

            {/* Governing value + unit */}
            <td className="py-1.5 text-right whitespace-nowrap align-middle">
              <span className="font-mono font-semibold text-gray-900 dark:text-white text-xs">
                {formatGeniusNumber(governing.value, displayDecimals)}
              </span>
              {governing.unit ? (
                <span className="ml-1 font-sans font-normal text-gray-500 dark:text-gray-400 text-xs">
                  <UnitMath unit={governing.unit} />
                </span>
              ) : null}
            </td>
          </tr>
        )}
      </tbody>
    </table>
    </div>
  );
}
if (false) {
function StepsViewSuperseded({ steps, results, onExplainStep, isExplaining = false }: StepsViewProps) {
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  if (!steps.length) return null;

  const toggleNotes = (stepId: string) => {
    setExpandedNotes((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  // Pick a governing result for the summary row.
  // Priority: last step that has a symbol + result (the terminal calculation),
  // then fall back to the first entry in the results array.
  const lastStep = steps.length > 0 ? steps[steps.length - 1] : null;
  const lastStepHasResult =
    lastStep &&
    !!lastStep.result &&
    lastStep.result !== "—" &&
    lastStep.result !== "-" &&
    lastStep.result.trim() !== "";

  const governing: { symbol?: string; label?: string; value: string; unit?: string } | null =
    lastStepHasResult && lastStep.symbol
      ? { symbol: lastStep.symbol, value: lastStep.result, unit: lastStep.unit }
      : lastStepHasResult
        ? { label: lastStep?.title, value: lastStep!.result, unit: lastStep!.unit }
        : results && results.length > 0
          ? { symbol: results[0].symbol, label: results[0].label, value: results[0].value, unit: results[0].unit }
          : null;

  return (
    <div className="worksheet-table-scroll worksheet-table-scroll--wide -mx-1 px-1">
    <table className="w-full border-collapse table-fixed">
      <colgroup>
        {/* # column — fixed narrow */}
        <col className="w-6" />
        {/* Step + formula column — takes remaining space */}
        <col />
        {/* Result column — fixed width so formula cell never gets squeezed off-screen */}
        <col className="w-24" />
      </colgroup>
      <thead>
        <tr className="border-b-2 border-gray-300 dark:border-gray-600">
          <th className="text-left py-1.5 pr-3 font-semibold text-gray-500 dark:text-gray-400 w-6 text-xs">#</th>
          <th className="text-left py-1.5 pr-3 font-semibold text-gray-500 dark:text-gray-400 text-xs">Step</th>
          <th className="text-right py-1.5 font-semibold text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">Result</th>
        </tr>
      </thead>
      <tbody>
        {steps.map((step, i) => {
          const mathLines = buildMathLines(step, displayDecimals);
          const hasResult =
            !!step.result &&
            step.result !== "—" &&
            step.result !== "-" &&
            step.result.trim() !== "";

          return (
            <tr
              key={step.id}
              id={`step-${step.id}`}
              className="border-b border-gray-200/90 dark:border-white/[0.08] last:border-b-0 result-row-reveal scroll-mt-4"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {/* Step number */}
              <td className="py-1.5 pr-3 text-gray-400 dark:text-gray-500 font-semibold tabular-nums align-top text-xs">
                {i + 1}
              </td>

              {/* Title + single merged math line */}
              <td className="py-1.5 pr-4 align-top min-w-0 step-formula-cell">
                <div className="flex items-baseline gap-1 mb-0.5">
                  <div className="font-semibold text-xs text-gray-800 dark:text-gray-200 leading-tight">
                    {step.title}
                  </div>
                  {step.sources && step.sources.length > 0 && (
                    <div className="flex gap-1">
                      {step.sources.map((s) => (
                        <span
                          key={s}
                          className="text-[10px] font-medium text-blue-500 dark:text-blue-400"
                        >
                          [{s}]
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <ResponsiveStepMath lines={mathLines} />

                {(() => {
                  const hasDescription = !!step.description;
                  const hasWarnings = !!step.warnings && step.warnings.length > 0;

                  const noteColorClass = hasWarnings
                    ? "text-amber-500 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300"
                    : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300";

                  const isExpanded = !!expandedNotes[step.id];

                  return (
                    <div className="mt-1">
                      <div data-print-hide="true" className="flex items-center gap-2">
                        {/* Toggle button — hidden in print (notes are always shown there) */}
                        {(hasDescription || hasWarnings) && (
                          <button
                            type="button"
                            onClick={() => toggleNotes(step.id)}
                            aria-expanded={isExpanded}
                            className={`step-notes-toggle inline-flex items-center gap-1 text-[11px] font-medium transition-colors ${noteColorClass}`}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                            Notes
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onExplainStep?.(step)}
                          disabled={!onExplainStep || isExplaining}
                          aria-label={`Explain ${step.title} in chat`}
                          title="Explain this step in chat"
                          className="inline-flex h-4 w-4 items-center justify-center rounded text-gray-400 transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-500 dark:hover:text-blue-400"
                        >
                          <CircleHelp aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Content always in DOM so @media print can force it visible */}
                      {(hasDescription || hasWarnings) && (
                      <div className={`step-notes-content mt-1 ${isExpanded ? "animate-in fade-in slide-in-from-top-1 duration-150" : "hidden"}`}>
                        {hasDescription && (
                          <div className="text-gray-500 dark:text-gray-400 text-xs leading-snug">
                            <RichTextRenderer content={step.description!} hideReferences />
                          </div>
                        )}

                        {step.warnings?.map((w, wi) => (
                          <div
                            key={wi}
                            className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"
                          >
                            <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0 text-amber-500" />
                            <span>{w}</span>
                          </div>
                        ))}
                      </div>
                      )}
                    </div>
                  );
                })()}

              </td>

              {/* Numeric result — right column */}
              <td className="py-1.5 text-right whitespace-nowrap align-top">
                {hasResult && (
                  <>
                    <span className="font-mono text-gray-900 dark:text-white text-xs">
                      {formatGeniusNumber(step.result!, displayDecimals)}
                    </span>
                    {step.unit ? (
                      <span className="ml-1 font-sans font-normal text-gray-500 dark:text-gray-400 text-xs">
                        <UnitMath unit={step.unit} />
                      </span>
                    ) : null}
                  </>
                )}
              </td>
            </tr>
          );
        })}

        {/* Summary row — governing result */}
        {governing && (
          <tr className="border-t-2 border-gray-300 dark:border-gray-600">
            {/* Empty # cell */}
            <td className="py-1.5 pr-3" />

            {/* Governing symbol */}
            <td className="py-1.5 pr-4">
              {governing.symbol ? (
                  <span className="text-xs text-gray-700 dark:text-gray-300">
                    <SymbolMath content={stripDelimiters(governing.symbol)} />
                  </span>
              ) : (
                <span className="font-semibold text-xs text-gray-700 dark:text-gray-300">
                  {governing.label}
                </span>
              )}
            </td>

            {/* Governing value + unit */}
            <td className="py-1.5 text-right whitespace-nowrap align-middle">
              <span className="font-mono font-semibold text-gray-900 dark:text-white text-xs">
                {formatGeniusNumber(governing.value, displayDecimals)}
              </span>
              {governing.unit ? (
                <span className="ml-1 font-sans font-normal text-gray-500 dark:text-gray-400 text-xs">
                  <UnitMath unit={governing.unit} />
                </span>
              ) : null}
            </td>
          </tr>
        )}
      </tbody>
    </table>
    </div>
  );
}
}
