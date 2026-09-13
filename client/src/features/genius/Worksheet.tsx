import { useCallback, useEffect, useRef, useState } from "react";
import { Printer, Sliders, Calculator, CheckCircle2, BarChart3, BookOpen, Lightbulb, Link2, History, AlertTriangle, Undo2, ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InputsTable } from "./InputsTable";
import { SymbolLegend } from "./SymbolLegend";
import { StepsView } from "./StepsView";
import { ResultsList, ConfidenceBlock, ReferencesList } from "./ResultsView";
import { VizRenderer } from "./VizRenderer";
import { formatSummarySentenceRows } from "./summarySentenceRows";
import { printCalculationPdf } from "./pdfExport";
import type { GeniusCalculationDoc, GeniusCalculationVersion, GeniusStep, GeniusStepComment } from "./types";
import type { CalculationDetails } from "./api";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function formatVersionDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

interface Props {
  doc: GeniusCalculationDoc;
  onChange: (doc: GeniusCalculationDoc) => void;
  onRecalc: () => void;
  isRecalculating: boolean;
  onExplainStep: (step: GeniusStep) => void;
  isExplaining: boolean;
  readOnly?: boolean;
  historicalVersion?: GeniusCalculationVersion | null;
  versions?: GeniusCalculationVersion[];
  onOpenVersion?: (version: number) => void;
  onReturnToLatest?: () => void;
  isLoadingVersion?: boolean;
  calculationId?: number | null;
  onSaveDetails?: (details: CalculationDetails, calculationId: number) => Promise<unknown>;
  isBusy?: boolean;
  stepComments?: GeniusStepComment[];
  onAddStepComment?: (stepId: string, content: string) => Promise<unknown>;
  onUpdateStepComment?: (stepId: string, commentId: number, content: string) => Promise<unknown>;
  onDeleteStepComment?: (stepId: string, commentId: number) => Promise<unknown>;
  isSavingStepComment?: boolean;
  isUpdatingStepComment?: boolean;
  isDeletingStepComment?: boolean;
}

function Section({
  id,
  title,
  icon: Icon,
  count,
  children,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="worksheet-section-card scroll-mt-4 rounded-xl border border-gray-300 dark:border-white/[0.12] bg-gray-50 shadow-sm dark:bg-[#161a22] overflow-hidden"
    >
      <div className="worksheet-section-header flex items-center gap-2 border-b border-gray-200 dark:border-white/[0.12] bg-gray-100/80 px-5 py-2.5 dark:bg-white/[0.05]">
        <Icon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{title}</span>
        {count ? (
          <span className="ml-auto text-[11px] tabular-nums font-medium text-gray-400 dark:text-gray-500">{count}</span>
        ) : null}
      </div>
      <div className="worksheet-section-body bg-gray-50 px-5 py-4 dark:bg-[#161a22]">
        {children}
      </div>
    </section>
  );
}

export function Worksheet({ doc, onChange, onRecalc, isRecalculating, onExplainStep, isExplaining, readOnly = false, historicalVersion, versions = [], onOpenVersion, onReturnToLatest, isLoadingVersion = false, calculationId, onSaveDetails, isBusy = false, stepComments = [], onAddStepComment, onUpdateStepComment, onDeleteStepComment, isSavingStepComment = false, isUpdatingStepComment = false, isDeletingStepComment = false }: Props) {
  const hasExpertSummary = !!doc.expertSummary?.trim();
  const hasConfidence = !!(doc.confidence && doc.confidence.score > 0);
  const hasRecommendations = doc.recommendations && doc.recommendations.length > 0;
  const hasReferences = doc.references.length > 0;
  const chartVisualizations = doc.visualizations.filter((v) => v.type === "chart");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [details, setDetails] = useState<CalculationDetails>(() => ({
    authorName: doc.details?.authorName ?? "",
    projectNameNumber: doc.details?.projectNameNumber ?? "",
    notes: doc.details?.notes ?? "",
  }));
  const detailsRef = useRef(details);
  const savedDetailsRef = useRef(details);
  const saveInFlightRef = useRef(false);
  const calculationIdRef = useRef(calculationId);
  const saveSessionRef = useRef(0);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsSaveState, setDetailsSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveAttempt, setSaveAttempt] = useState(0);
  const documentDetails: CalculationDetails = {
    authorName: doc.details?.authorName ?? "",
    projectNameNumber: doc.details?.projectNameNumber ?? "",
    notes: doc.details?.notes ?? "",
  };
  const detailsMatch = (left: CalculationDetails, right: CalculationDetails) =>
    left.authorName === right.authorName
    && left.projectNameNumber === right.projectNameNumber
    && left.notes === right.notes;
  detailsRef.current = details;

  useEffect(() => {
    if (calculationIdRef.current !== calculationId) {
      calculationIdRef.current = calculationId;
      saveSessionRef.current++;
      detailsRef.current = documentDetails;
      savedDetailsRef.current = documentDetails;
      setDetails(documentDetails);
      setDetailsError(null);
      setDetailsSaveState("idle");
      return;
    }
    // A response for an older autosave must not replace text typed while it
    // was pending. Historical documents always take precedence because they
    // intentionally display their saved, read-only metadata.
    if (readOnly || detailsMatch(detailsRef.current, savedDetailsRef.current)) {
      detailsRef.current = documentDetails;
      savedDetailsRef.current = documentDetails;
      setDetails(documentDetails);
      setDetailsError(null);
      setDetailsSaveState("idle");
    }
  }, [calculationId, doc.details?.authorName, doc.details?.projectNameNumber, doc.details?.notes, readOnly]);

  const canSaveDetails = calculationId != null && !!onSaveDetails && !readOnly && !isBusy && !isRecalculating;
  const persistDetails = useCallback(async () => {
    if (!canSaveDetails || !onSaveDetails || calculationId == null || saveInFlightRef.current) return;
    const snapshot = detailsRef.current;
    if (detailsMatch(snapshot, savedDetailsRef.current)) return;

    const saveSession = saveSessionRef.current;
    saveInFlightRef.current = true;
    setDetailsError(null);
    setDetailsSaveState("saving");
    try {
      await onSaveDetails(snapshot, calculationId);
      if (saveSession !== saveSessionRef.current) return;
      savedDetailsRef.current = snapshot;
      setDetailsSaveState(detailsMatch(detailsRef.current, snapshot) ? "saved" : "idle");
    } catch (err) {
      if (saveSession !== saveSessionRef.current) return;
      setDetailsError(err instanceof Error ? err.message : "Unable to save calculation details. Your edits are still here.");
      setDetailsSaveState("error");
    } finally {
      saveInFlightRef.current = false;
      // If typing continued during this request, schedule the newest values.
      // A failed unchanged snapshot remains available for an explicit retry.
      if (saveSession === saveSessionRef.current && !detailsMatch(detailsRef.current, snapshot)) setSaveAttempt((attempt) => attempt + 1);
    }
  }, [calculationId, canSaveDetails, onSaveDetails]);

  useEffect(() => {
    if (!canSaveDetails || detailsMatch(details, savedDetailsRef.current)) return;
    const timeout = window.setTimeout(() => { void persistDetails(); }, 500);
    return () => window.clearTimeout(timeout);
  }, [canSaveDetails, details, persistDetails, saveAttempt]);

  const updateDetails = (update: Partial<CalculationDetails>) => {
    setDetails((current) => ({ ...current, ...update }));
    setDetailsError(null);
    setDetailsSaveState("idle");
  };

  const generatedDate = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="worksheet-print-root mx-auto max-w-[57.6rem] px-6 py-6 space-y-4">

      {/* Print-only document header — hidden on screen, shown when printing */}
      <header
        className="print-only-header hidden"
        style={{ marginBottom: "16pt", borderBottom: "2px solid #d1d5db", paddingBottom: "8pt" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ fontSize: "8pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#6b7280", marginBottom: "4pt" }}>
              Engineering Calculation
            </p>
            <h1 style={{ fontSize: "14pt", fontWeight: 700, color: "#111111", margin: 0 }}>{doc.projectTitle}</h1>
            {doc.problemStatement && (
              <p style={{ fontSize: "9pt", color: "#374151", marginTop: "4pt", lineHeight: 1.4 }}>
                {doc.problemStatement}
              </p>
            )}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <p style={{ fontSize: "7pt", fontWeight: 700, color: "#6b7280", letterSpacing: "0.08em" }}>GeniusX1</p>
            <p style={{ fontSize: "7pt", color: "#9ca3af", marginTop: "2pt" }}>{generatedDate}</p>
          </div>
        </div>
      </header>

      {/* Project header card — "Calculation Requirement" */}
      <div className="worksheet-header-card flex flex-col gap-4 rounded-xl border border-gray-300 bg-gray-50 px-5 py-4 shadow-sm dark:border-white/[0.12] dark:bg-[#161a22]">
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="inline-block mb-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border border-blue-200/60 dark:border-blue-500/20 px-2 py-0.5 rounded-full">
            Calculation Requirement
          </span>

          {/* Right-hand actions — hidden in print */}
          <div data-print-hide="true" className="flex items-center gap-2">
             <button
               type="button"
               aria-expanded={detailsOpen}
               aria-controls="calculation-details"
               onClick={() => setDetailsOpen((open) => !open)}
               className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-gray-300 bg-white px-2 text-[10px] font-semibold text-gray-700 shadow-sm transition-colors hover:border-gray-400 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-1 dark:border-white/[0.14] dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1] dark:hover:text-white dark:focus-visible:ring-offset-[#161a22]"
             >
               Details
               <ChevronDown className={`h-3 w-3 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
             </button>
            {/* Version history badge */}
            {versions.length > 0 && (() => {
              const latest = versions[0];
              const displayedVersion = readOnly && historicalVersion ? historicalVersion : latest;
              return (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-gray-300 bg-white px-2 text-[10px] font-semibold text-gray-700 shadow-sm transition-colors hover:border-gray-400 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-1 dark:border-white/[0.14] dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1] dark:hover:text-white dark:focus-visible:ring-offset-[#161a22]">
                      <History className="h-2.5 w-2.5" />
                       Version {displayedVersion.version} · {formatVersionDate(displayedVersion.createdAt)}
                    </button>
                  </PopoverTrigger>
                   <PopoverContent align="end" className="w-72 p-3">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Version history</p>
                    <ul className="space-y-1">
                       {versions.map((v) => (
                         <li key={v.version}>
                           <TooltipProvider>
                             <Tooltip>
                               <TooltipTrigger asChild>
                                 <button type="button" onClick={() => onOpenVersion?.(v.version)} disabled={isLoadingVersion}
                                   className="flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-xs text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-white/10">
                                   <span className="font-medium">Version {v.version}{!readOnly && v.version === latest.version ? " · Current" : readOnly && v.version === historicalVersion?.version ? " · Viewing" : ""}</span>
                                   <span>{formatVersionDate(v.createdAt)}</span>
                                 </button>
                               </TooltipTrigger>
                               <TooltipContent side="left" className="max-w-xs text-xs">{v.summary}</TooltipContent>
                             </Tooltip>
                           </TooltipProvider>
                         </li>
                       ))}
                    </ul>
                  </PopoverContent>
                </Popover>
              );
            })()}

            {/* Export PDF button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => printCalculationPdf(doc.projectTitle)}
              className="h-7 shrink-0 gap-1.5 border-gray-300 bg-white text-xs font-medium text-gray-700 shadow-sm hover:border-gray-400 hover:bg-gray-100 hover:text-gray-900 dark:border-white/[0.14] dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1] dark:hover:text-white"
            >
              <Printer className="h-3 w-3" />
              Export PDF
            </Button>
          </div>
       {readOnly && historicalVersion && (
         <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
           <span><strong>Viewing Version {historicalVersion.version}</strong> — this saved calculation is read-only.</span>
           <Button size="sm" variant="outline" onClick={onReturnToLatest} className="gap-1.5"><Undo2 className="h-3.5 w-3.5" />Return to latest</Button>
         </div>
       )}
        </div>

        <div className="w-full min-w-0">
          <h1 className="text-base font-bold tracking-tight text-gray-900 dark:text-white">{doc.projectTitle}</h1>
          {doc.problemStatement && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{doc.problemStatement}</p>
          )}
        </div>
         <section
           id="calculation-details"
           aria-label="Calculation details"
           className={`calculation-details-content border-t border-gray-200 pt-4 dark:border-white/[0.12] ${detailsOpen ? "" : "hidden"}`}
         >
           <div className="grid gap-3 sm:grid-cols-2">
             <label className="grid gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
               Name
               <input
                 value={details.authorName}
                  onChange={(event) => updateDetails({ authorName: event.target.value })}
                 maxLength={200}
                 readOnly={readOnly}
                 className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/60 dark:border-white/[0.14] dark:bg-white/[0.06] dark:text-white"
               />
             </label>
             <label className="grid gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
               Project name/number
               <input
                 value={details.projectNameNumber}
                  onChange={(event) => updateDetails({ projectNameNumber: event.target.value })}
                 maxLength={300}
                 readOnly={readOnly}
                 className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/60 dark:border-white/[0.14] dark:bg-white/[0.06] dark:text-white"
               />
             </label>
           </div>
           <label className="mt-3 grid gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
             Notes
             <textarea
               value={details.notes}
                onChange={(event) => updateDetails({ notes: event.target.value })}
               maxLength={5000}
               rows={4}
               readOnly={readOnly}
               className="min-h-24 w-full resize-y rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/60 dark:border-white/[0.14] dark:bg-white/[0.06] dark:text-white"
             />
           </label>
           {!readOnly && (
              <div data-print-hide="true" className="mt-3 flex min-h-4 flex-wrap items-center gap-2 text-xs">
                {detailsSaveState === "saving" && <p role="status" aria-live="polite" className="text-gray-500 dark:text-gray-400">Saving…</p>}
                {detailsSaveState === "saved" && <p role="status" aria-live="polite" className="text-gray-500 dark:text-gray-400">Saved</p>}
                {detailsError && (
                  <>
                    <p role="alert" className="text-red-600 dark:text-red-400">{detailsError}</p>
                    <button type="button" onClick={() => { void persistDetails(); }} disabled={!canSaveDetails} className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300">Retry</button>
                  </>
                )}
             </div>
           )}
         </section>
      </div>

       {(doc.details?.authorName || doc.details?.projectNameNumber || doc.details?.notes) && (
         <section className="print-calculation-details hidden" aria-label="Calculation report details">
           {doc.details.authorName && <p><strong>Name:</strong> {doc.details.authorName}</p>}
           {doc.details.projectNameNumber && <p><strong>Project:</strong> {doc.details.projectNameNumber}</p>}
           {doc.details.notes && <p className="print-calculation-details-notes"><strong>Notes:</strong> {doc.details.notes}</p>}
         </section>
       )}

      {(doc.inputs.length > 0 || doc.assumptions.length > 0) && (
        <Section
          id="section-inputs"
          title="Input Values"
          icon={Sliders}
          count={doc.inputs.length + doc.assumptions.length}
        >
          <div className="scrollbar-x-thin overflow-x-auto sm:overflow-x-visible">
             <InputsTable doc={doc} onChange={onChange} onRecalc={onRecalc} isRecalculating={isRecalculating} readOnly={readOnly} />
          </div>
          <SymbolLegend doc={doc} />
        </Section>
      )}

      {doc.steps.length > 0 && (
        <Section id="section-steps" title="Calculation Steps" icon={Calculator} count={doc.steps.length}>
          {doc.steps.some((step) => step.reviewNeeded) && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <div><strong>Unit review needed.</strong> {doc.steps.filter((step) => step.reviewNeeded).flatMap((step) => step.warnings || []).join(" ")}</div>
            </div>
          )}
          <StepsView
            steps={doc.steps}
            results={doc.results}
            displayDecimals={doc.displayDecimals}
            onExplainStep={onExplainStep}
            isExplaining={isExplaining}
            readOnly={readOnly}
            comments={stepComments}
            onAddComment={onAddStepComment}
            onUpdateComment={onUpdateStepComment}
            onDeleteComment={onDeleteStepComment}
            isSavingComment={isSavingStepComment}
            isUpdatingComment={isUpdatingStepComment}
            isDeletingComment={isDeletingStepComment}
          />
        </Section>
      )}

      {doc.results.length > 0 && (
        <Section id="section-results" title="Results" icon={CheckCircle2} count={doc.results.length}>
          <ResultsList doc={doc} />
        </Section>
      )}

      {chartVisualizations.length > 0 && (
        <Section id="section-charts" title="Charts" icon={BarChart3} count={chartVisualizations.length}>
          <VizRenderer
            visualizations={chartVisualizations}
            displayDecimals={doc.displayDecimals}
          />
        </Section>
      )}

      {hasReferences && (
        <Section id="section-refs" title="References" icon={Link2} count={doc.references.length}>
          <ReferencesList doc={doc} />
        </Section>
      )}

      {/* Calculation summary — calculation reasoning first, confidence second */}
      {(hasExpertSummary || hasConfidence) && (
        <Section
          id="section-expert-summary"
          title={hasExpertSummary ? "Calculation Summary" : "Calculation Confidence"}
          icon={BookOpen}
        >
          {hasExpertSummary && (
            <section aria-label="Calculation summary">
              <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {formatSummarySentenceRows(doc.expertSummary).map((sentence, index) => (
                  <p key={index} data-testid="calculation-summary-sentence">{sentence}</p>
                ))}
              </div>
            </section>
          )}
          {hasExpertSummary && hasConfidence && (
            <div className="my-4 border-t border-gray-200 dark:border-white/[0.12]" role="separator" />
          )}
          {hasConfidence && (
            <section aria-labelledby="ai-summary-confidence">
              <h3
                id="ai-summary-confidence"
                className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
              >
                Calculation Confidence
              </h3>
              <ConfidenceBlock doc={doc} />
            </section>
          )}
        </Section>
      )}

      {hasRecommendations && (
        <Section id="section-recommendations" title="AI Recommendations" icon={Lightbulb}>
          <ol className="space-y-2">
            {doc.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full bg-amber-100 dark:bg-amber-500/15 border border-amber-300/60 dark:border-amber-500/25 flex items-center justify-center text-[10px] font-bold text-amber-700 dark:text-amber-400">
                  {i + 1}
                </span>
                <span className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{rec}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

    </div>
  );
}
