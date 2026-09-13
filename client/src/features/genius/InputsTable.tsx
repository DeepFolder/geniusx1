import { RefreshCw, User, Cpu } from "lucide-react";
import { useState, useEffect } from "react";
import { OrbAnimation } from "@/features/deepsearch/components/ThinkingIndicator";
import { UnitMath, SymbolMath } from "@/components/chat/MathHelpers";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { canonicalUnit } from "@shared/unit-canonical";
import { getUnitFamily, convertUnitValue, formatConvertedValue } from "@shared/unit-families";
import type { GeniusCalculationDoc } from "./types";

/**
 * Renders the unit of an input/assumption. When the row is editable and the
 * unit belongs to a known family, the unit becomes a click target that opens
 * a compact dropdown of related units; selecting one converts the value.
 * Otherwise it stays a plain label — identical look, no hover cue.
 */
function UnitCell({
  unit,
  value,
  editable,
  disabled,
  onConvert,
}: {
  unit: string;
  value: string | number;
  editable: boolean;
  disabled: boolean;
  onConvert: (newValue: string, newUnit: string) => void;
}) {
  const family = editable ? getUnitFamily(unit) : null;
  const numeric = typeof value === "number" ? value : parseFloat(String(value).replace(/,/g, ""));
  const canConvert = !!family && Number.isFinite(numeric);

  if (!canConvert) {
    return (
      <span className="text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
        <UnitMath unit={unit} />
      </span>
    );
  }

  const current = canonicalUnit(unit);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className="text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 focus:outline-none"
          data-testid={`button-unit-${current}`}
        >
          <UnitMath unit={unit} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[4rem]">
        {family!.units.map((u) => (
          <DropdownMenuItem
            key={u.unit}
            className={`text-xs ${u.unit === current ? "font-semibold text-blue-600 dark:text-blue-400" : ""}`}
            onSelect={() => {
              if (u.unit === current) return;
              const converted = convertUnitValue(numeric, current, u.unit);
              if (converted == null) return;
              onConvert(formatConvertedValue(converted), u.unit);
            }}
          >
            {u.unit}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface Props {
  doc: GeniusCalculationDoc;
  onChange: (doc: GeniusCalculationDoc) => void;
  onRecalc: () => void;
  isRecalculating: boolean;
  readOnly?: boolean;
}

// Saved calculations created before SI-normalized evaluation may include a
// conversion inside expr (for example, `v / 3.6` for km/h → m/s). Remember the
// unit that such a formula expects when the user changes the input display unit.
// SI-native formulas have no matching conversion and continue to evaluate in SI.
function legacyEvaluationUnit(doc: GeniusCalculationDoc, symbol: string, currentUnit: string): string | undefined {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // `v / 3.6` is an unambiguous legacy km/h → m/s conversion. Infer km/h
  // rather than trusting the current label, since a prior buggy recalculation
  // may already have changed that label to m/s.
  if (doc.steps.some((step) => new RegExp(`\\b${escaped}\\b\\s*/\\s*3\\.6\\b`).test(step.expr))) {
    return "km/h";
  }
  const scale = "(?:1000|1e[36]|60|3600)";
  const afterSymbol = new RegExp(`\\b${escaped}\\b\\s*(?:\\*|/)\\s*${scale}\\b`);
  const beforeSymbol = new RegExp(`\\b${scale}\\b\\s*\\*\\s*${escaped}\\b`);
  return doc.steps.some((step) => afterSymbol.test(step.expr) || beforeSymbol.test(step.expr))
    ? currentUnit
    : undefined;
}

export function InputsTable({ doc, onChange, onRecalc, isRecalculating, readOnly = false }: Props) {
  // Track which assumption IDs the user has manually edited so we can flip
  // their source badge from "Assumed" → "Given".
  const [userEditedAssumptions, setUserEditedAssumptions] = useState<Set<string>>(new Set());

  // Reset when a genuinely new calculation is loaded (different first assumption ID
  // means a different doc, not just a recalculation of the same one).
  const firstAssumptionId = doc.assumptions[0]?.id ?? "";
  useEffect(() => {
    setUserEditedAssumptions(new Set());
  }, [firstAssumptionId]);

  const setInput = (id: string, value: string) => {
    if (!readOnly) onChange({ ...doc, inputs: doc.inputs.map((i) => (i.id === id ? { ...i, value } : i)) });
  };
  const setAssumption = (id: string, value: string) => {
    if (readOnly) return;
    setUserEditedAssumptions((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    onChange({ ...doc, assumptions: doc.assumptions.map((a) => (a.id === id ? { ...a, value } : a)) });
  };
  const convertInput = (id: string, value: string, unit: string) => {
    if (!readOnly) {
      onChange({
        ...doc,
        inputs: doc.inputs.map((i) => (
          i.id === id
            ? {
              ...i,
              value,
              unit,
              evaluationUnit: i.evaluationUnit ?? legacyEvaluationUnit(doc, i.symbol, i.unit),
            }
            : i
        )),
      });
    }
  };
  const convertAssumption = (id: string, value: string, unit: string) => {
    if (readOnly) return;
    setUserEditedAssumptions((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    onChange({
      ...doc,
      assumptions: doc.assumptions.map((a) => (
        a.id === id
          ? {
            ...a,
            value,
            unit,
            evaluationUnit: a.evaluationUnit ?? (a.symbol ? legacyEvaluationUnit(doc, a.symbol, a.unit) : undefined),
          }
          : a
      )),
    });
  };

  return (
    <TooltipProvider delayDuration={300}>
    <div>
      <div className="scrollbar-x-thin overflow-x-auto -mx-1 px-1">
      <table className="worksheet-aligned-table worksheet-inputs-table w-full border-collapse table-fixed">
        <colgroup>
          {/* Shared with SymbolLegend: Parameter and Meaning start on this guide. */}
          <col className="worksheet-symbol-column" />
          {/* This is the same start guide used by Meaning in SymbolLegend. */}
          <col className="worksheet-parameter-column" />
          <col className="worksheet-value-column" />
          <col className="worksheet-source-column" />
        </colgroup>
        <thead>
          <tr className="border-b-2 border-gray-300 dark:border-gray-600">
              <th className="worksheet-symbol-cell text-left py-1.5 pr-2 sm:pr-6 font-semibold text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">Sym.</th>
              <th className="worksheet-parameter-cell text-left py-1.5 pr-2 sm:pr-6 font-semibold text-gray-500 dark:text-gray-400 text-xs">Parameter</th>
              <th className="worksheet-value-cell text-left py-1.5 pr-2 sm:pr-4 font-semibold text-gray-500 dark:text-gray-400 text-xs">Value</th>
            <th className="text-right py-1.5 font-semibold text-gray-500 dark:text-gray-400 text-xs">
              <span className="hidden sm:inline">Source</span>
              <span className="sr-only sm:hidden">Source</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {doc.inputs.map((i) => (
            <tr key={i.id} className="border-b border-gray-200/90 dark:border-white/[0.08] last:border-b-0">
              <td className="worksheet-symbol-cell py-2 pr-2 sm:pr-6 text-gray-800 dark:text-gray-200 text-xs whitespace-nowrap">
                <SymbolMath content={i.symbol} />
              </td>
              <td className="worksheet-parameter-cell py-2 pr-2 sm:pr-6 text-gray-800 dark:text-gray-200 text-xs">
                <div className="worksheet-parameter-label">
                  <LabelWithTooltip text={i.description}>{i.label}</LabelWithTooltip>
                </div>
              </td>
              <td className="worksheet-value-cell py-1.5 pr-2 sm:pr-4">
                <div className="flex items-center gap-1 sm:gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={String(i.value)}
                    onChange={(e) => setInput(i.id, e.target.value)}
                    disabled={isRecalculating || readOnly}
                    className="w-14 sm:w-24 flex-shrink-0 rounded-md border border-gray-300 bg-white px-1.5 py-0.5 text-right text-xs tabular-nums text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 hover:border-blue-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500 dark:border-white/[0.18] dark:bg-black/30 dark:text-gray-100 dark:hover:border-blue-400 dark:focus:border-blue-400 dark:focus:ring-blue-400/25 dark:disabled:border-white/[0.08] dark:disabled:bg-white/[0.04] dark:disabled:text-gray-500"
                  />
                  {i.unit ? (
                    <UnitCell
                      unit={i.unit}
                      value={i.value}
                      editable={i.editable !== false && !readOnly}
                      disabled={isRecalculating || readOnly}
                      onConvert={(v, u) => convertInput(i.id, v, u)}
                    />
                  ) : null}
                </div>
              </td>
              <td className="py-1.5 text-right">
                <span
                  title="Given"
                  className="inline-flex items-center gap-1 px-1 sm:px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40"
                >
                  <User className="h-2.5 w-2.5 flex-shrink-0" />
                  <span className="hidden sm:inline">Given</span>
                </span>
              </td>
            </tr>
          ))}
          {doc.assumptions.map((a) => (
            <tr key={a.id} className="border-b border-gray-200/90 dark:border-white/[0.08] last:border-b-0">
              <td className="worksheet-symbol-cell py-2 pr-2 sm:pr-6 text-gray-800 dark:text-gray-200 text-xs whitespace-nowrap">
                <SymbolMath content={a.symbol} />
              </td>
              <td className="worksheet-parameter-cell py-2 pr-2 sm:pr-6 text-gray-800 dark:text-gray-200 text-xs">
                <div className="worksheet-parameter-label">
                  <LabelWithTooltip text={a.rationale}>{a.label}</LabelWithTooltip>
                </div>
              </td>
              <td className="worksheet-value-cell py-1.5 pr-2 sm:pr-4">
                <div className="flex items-center gap-1 sm:gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={String(a.value)}
                    onChange={(e) => setAssumption(a.id, e.target.value)}
                    disabled={isRecalculating || readOnly}
                    className="w-14 sm:w-24 flex-shrink-0 rounded-md border border-gray-300 bg-white px-1.5 py-0.5 text-right text-xs tabular-nums text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 hover:border-blue-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500 dark:border-white/[0.18] dark:bg-black/30 dark:text-gray-100 dark:hover:border-blue-400 dark:focus:border-blue-400 dark:focus:ring-blue-400/25 dark:disabled:border-white/[0.08] dark:disabled:bg-white/[0.04] dark:disabled:text-gray-500"
                  />
                  {a.unit ? (
                    <UnitCell
                      unit={a.unit}
                      value={a.value}
                      editable={a.editable !== false && !readOnly}
                      disabled={isRecalculating || readOnly}
                      onConvert={(v, u) => convertAssumption(a.id, v, u)}
                    />
                  ) : null}
                </div>
              </td>
              <td className="py-1.5 text-right">
                {userEditedAssumptions.has(a.id) ? (
                  <span
                    title="Given"
                    className="inline-flex items-center gap-1 px-1 sm:px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40"
                  >
                    <User className="h-2.5 w-2.5 flex-shrink-0" />
                    <span className="hidden sm:inline">Given</span>
                  </span>
                ) : (
                  <span
                    title="Assumed"
                    className="inline-flex items-center gap-1 px-1 sm:px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-50 dark:bg-white/[0.04] text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-white/[0.1]"
                  >
                    <Cpu className="h-2.5 w-2.5 flex-shrink-0" />
                    <span className="hidden sm:inline">Assumed</span>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <div data-print-hide="true" className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => { if (!readOnly) onRecalc(); }}
          disabled={isRecalculating || readOnly}
          className="h-7 gap-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700"
        >
          <RefreshCw className={`h-3 w-3 ${isRecalculating ? "animate-spin" : ""}`} />
          {isRecalculating ? "Recalculating…" : "Recalculate"}
        </Button>
        {isRecalculating && <OrbAnimation size={28} />}
      </div>
    </div>
    </TooltipProvider>
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
