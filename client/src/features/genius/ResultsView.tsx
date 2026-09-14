import { ExternalLink, AlertTriangle } from "lucide-react";
import { UnitMath, SymbolMath } from "@/components/chat/MathHelpers";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GeniusCalculationDoc } from "./types";
import { getGeniusConfidenceLevel, type SourceTier } from "@shared/schema";
import { formatGeniusNumber } from "@shared/genius-number-format";

function confidenceColor(score: number): string {
  if (score >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

const TIER_BADGE: Record<SourceTier, { label: string; cls: string }> = {
  standard:     { label: "Standard",     cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  handbook:     { label: "Handbook",     cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  academic:     { label: "Academic",     cls: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300" },
  manufacturer: { label: "Manufacturer", cls: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300" },
  general:      { label: "General",      cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  unknown:      { label: "Unverified",   cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
};

function SourceBadge({ tier }: { tier: SourceTier }) {
  const { label, cls } = TIER_BADGE[tier] ?? TIER_BADGE.unknown;
  return (
    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded leading-none ${cls}`}>
      {label}
    </span>
  );
}

export function ResultsList({ doc, showDisclaimer = true }: { doc: GeniusCalculationDoc; showDisclaimer?: boolean }) {
  if (!doc.results.length) return null;
  const [primary, ...rest] = doc.results;
  return (
    <TooltipProvider delayDuration={300}>
    <div className="scrollbar-x-thin overflow-x-auto sm:overflow-x-visible -mx-1 px-1">
    <table className="w-full text-xs border-collapse">
      <colgroup>
        {/* Symbol — narrow fixed column */}
        <col className="w-10 sm:w-12" />
        {/* Label — absorbs remaining space */}
        <col />
        <col />
      </colgroup>
      <thead>
        <tr className="border-b border-gray-300 dark:border-white/[0.12]">
          <th className="text-left pb-2 pr-2 font-semibold text-gray-500 dark:text-gray-400 text-xs">Sym.</th>
          <th className="text-left pb-2 pr-3 font-semibold text-gray-500 dark:text-gray-400 text-xs">Parameter</th>
          <th className="text-right pb-2 font-semibold text-gray-500 dark:text-gray-400 text-xs sm:whitespace-nowrap">Value</th>
        </tr>
      </thead>
      <tbody>
        {rest.map((r) => (
          <tr key={r.id} className="border-b border-gray-200/90 dark:border-white/[0.08]">
            <td className="py-2 pr-2 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">
              <SymbolMath content={r.symbol} />
            </td>
            <td className="py-2 pr-3 text-xs text-gray-700 dark:text-gray-300">
              <LabelWithTooltip text={r.description}>{r.label}</LabelWithTooltip>
            </td>
            <td className="py-2 text-right sm:whitespace-nowrap">
              <span className={`font-mono text-xs ${r.reviewNeeded ? "text-amber-700 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>{formatGeniusNumber(r.value, doc.displayDecimals)}</span>
              {r.reviewNeeded && <AlertTriangle aria-label="Unit review needed" size={12} className="inline ml-1 text-amber-500" />}
              {r.unit ? (
                <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                  <UnitMath unit={r.unit} />
                </span>
              ) : null}
            </td>
          </tr>
        ))}
        <tr className="border-t-2 border-gray-300 dark:border-white/[0.15]">
          <td className="pt-2 pr-2 text-xs text-gray-800 dark:text-gray-200 whitespace-nowrap">
            <SymbolMath content={primary.symbol} />
          </td>
          <td className="pt-2 pr-3 font-semibold text-xs text-gray-800 dark:text-gray-200">
            <LabelWithTooltip text={primary.description}>{primary.label}</LabelWithTooltip>
          </td>
          <td className="pt-2 text-right sm:whitespace-nowrap">
            <span className={`font-mono text-xs ${primary.reviewNeeded ? "text-amber-700 dark:text-amber-400" : "text-gray-900 dark:text-white"}`}>{formatGeniusNumber(primary.value, doc.displayDecimals)}</span>
            {primary.reviewNeeded && <AlertTriangle aria-label="Unit review needed" size={12} className="inline ml-1 text-amber-500" />}
            {primary.unit ? (
              <span className="ml-1 text-xs font-normal text-gray-600 dark:text-gray-300">
                <UnitMath unit={primary.unit} />
              </span>
            ) : null}
          </td>
        </tr>
      </tbody>
    </table>
    </div>
    {doc.results.some((result) => result.reviewNeeded) && (
      <div className="flex items-start gap-2 mt-3 rounded-md border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5">
        <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="text-xs leading-snug text-amber-800 dark:text-amber-300">
          <p className="font-semibold">Unit review needed</p>
          {doc.results.filter((result) => result.reviewNeeded).flatMap((result) => result.warnings || []).map((warning, index) => <p key={index} className="mt-1">{warning}</p>)}
        </div>
      </div>
    )}
    {showDisclaimer && (
      <div className="flex items-start gap-2 mt-3 rounded-md border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 px-3 py-2.5">
        <AlertTriangle size={13} className="mt-0.5 flex-shrink-0 text-amber-500 dark:text-amber-400" />
        <p className="text-[11px] italic leading-snug text-amber-800 dark:text-amber-300">
          AI-generated calculations may contain errors. These calculations must be verified and approved by a qualified professional (engineer, scientist, or other relevant expert) before use in any real application.
        </p>
      </div>
    )}
    </TooltipProvider>
  );
}

export function ConfidenceBlock({ doc }: { doc: GeniusCalculationDoc }) {
  const c = doc.confidence;
  if (!c || c.score <= 0) return null;
  const confidenceLevel = getGeniusConfidenceLevel(c.score);
  return (
    <div>
      <p className={`mb-1.5 text-sm font-bold ${confidenceColor(c.score)}`}>{confidenceLevel} Confidence</p>
      {c.explanation && (
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{c.explanation}</p>
      )}
      {c.factors && c.factors.length > 0 && (
        <ul className="space-y-1 mb-3">
          {c.factors.map((f, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span className="mt-0.5 text-gray-300 dark:text-gray-600">•</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}
      {c.sourceQualityNote && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{c.sourceQualityNote}</span>
        </div>
      )}
    </div>
  );
}

export function ReferencesList({ doc }: { doc: GeniusCalculationDoc }) {
  if (!doc.references.length) return null;
  return (
    <>
      <p className="mb-2 text-xs text-gray-400 dark:text-gray-500 italic">
        Links appear only when web search is enabled during generation.
      </p>
      <ol className="space-y-2">
        {doc.references.map((r) => {
          const tier = (r as any).sourceType as SourceTier | undefined;
          return (
            <li key={r.id} className="flex flex-wrap items-start gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
              <span className="font-semibold text-blue-600 dark:text-blue-400 flex-shrink-0">[{r.id}]</span>
              {tier && <SourceBadge tier={tier} />}
              {r.url ? (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-blue-600 hover:underline dark:hover:text-blue-400"
                >
                  {r.title}
                  <ExternalLink size={11} className="flex-shrink-0 opacity-60" />
                </a>
              ) : (
                <span>{r.title}</span>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** @deprecated Use ConfidenceBlock + ReferencesList separately. Kept for safety. */
export function ConfidenceAndReferences({ doc }: { doc: GeniusCalculationDoc }) {
  return (
    <div className="space-y-5">
      <ConfidenceBlock doc={doc} />
      <ReferencesList doc={doc} />
    </div>
  );
}

/** Wraps a label in a tooltip when `text` is non-empty; otherwise renders children plainly. */
function LabelWithTooltip({ text, children }: { text?: string; children: React.ReactNode }) {
  if (!text) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{children}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm text-xs leading-snug whitespace-normal">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
