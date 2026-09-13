import { useEffect, useState } from "react";
import { Calculator, User, Database, FileText, Globe, Sparkles, BookOpen, Building2, RefreshCw, Loader2, X } from "lucide-react";
import { RichTextRenderer } from "@/components/chat/RichTextRenderer";
import { MaybeMath, UnitMath, SymbolMath } from "@/components/chat/MathHelpers";
import { OrbAnimation } from "@/features/deepsearch/components/ThinkingIndicator";

export interface CalculationStep {
  label: string;
  content?: string;
  formula?: string;
  result?: string | { value: string; unit?: string };
}

function normalizeStepResult(raw: unknown): { value: string; unit?: string } | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'object') {
    const r = raw as { value?: unknown; unit?: unknown };
    const v = r.value != null ? String(r.value) : '';
    const u = r.unit != null ? String(r.unit) : '';
    if (!v && !u) return undefined;
    return { value: v, unit: u || undefined };
  }
  const str = String(raw).trim();
  if (!str) return undefined;
  if (/[=×\u00d7\u2248\u2248]/.test(str)) return { value: str };
  const m = str.match(/^(.+?)\s+([A-Za-z\u00b5\u03bc\u03a9\u00b0][A-Za-z0-9\/\u00b2\u00b3\u00b7.\-]*)$/);
  if (m) return { value: m[1].trim(), unit: m[2].trim() };
  return { value: str };
}

function injectDisplayStyle(formula: string): string {
  let s = formula;
  s = s.replace(/\\\((.+?)\\\)/gs, (_m, inner) => `\\(\\displaystyle ${inner.trim()}\\)`);
  s = s.replace(/\$\$(.+?)\$\$/gs, (_m, inner) => `\\[\\displaystyle ${inner.trim()}\\]`);
  return s;
}

const MATH_DELIMITER_RE = /\\\(|\\\[|\$\$/;
const DENSE_LABEL_RE = /[=+\-*/^_]{1}.*[=+\-*/^_]{1}/;

function splitLabelAtMath(label: string): { header: string; mathRemainder: string | null } {
  const match = MATH_DELIMITER_RE.exec(label);
  if (!match) {
    if (label.length > 80 && DENSE_LABEL_RE.test(label)) {
      return { header: '', mathRemainder: label };
    }
    return { header: label, mathRemainder: null };
  }
  const header = label.slice(0, match.index).trim();
  const mathRemainder = label.slice(match.index).trim();
  if (!mathRemainder) return { header: label, mathRemainder: null };
  return { header, mathRemainder };
}

function stripLatexDelimiters(content: string): string {
  return String(content)
    .replace(/^\\\(\s*|\s*\\\)$/g, '')
    .replace(/^\\\[\s*|\s*\\\]$/g, '')
    .trim();
}

function MaybeMathValue({ content }: { content?: string | null }) {
  if (!content) return null;
  const stripped = stripLatexDelimiters(content);
  if (!stripped) return null;
  if (/\d/.test(stripped)) return <>{stripped}</>;
  return <MaybeMath content={stripped} />;
}

function cleanResultValue(rawValue?: string | null): { value: string; unit?: string } {
  if (rawValue == null) return { value: '' };
  const stripped = String(rawValue)
    .replace(/^\\\(\s*|\s*\\\)$/g, '')
    .replace(/^\\\[\s*|\s*\\\]$/g, '')
    .trim();
  if (!stripped) return { value: '' };

  const eqIdx = Math.max(stripped.lastIndexOf('='), stripped.lastIndexOf('\u2248'), stripped.lastIndexOf('\u2243'));
  const tail = eqIdx >= 0 ? stripped.slice(eqIdx + 1).trim() : stripped;

  const numUnitMatch = tail.match(/([+-]?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?)\s*([A-Za-z\u00b5\u03bc\u03a9\u00b0][A-Za-z0-9\/\u00b2\u00b3\u00b7.\-]*)?\s*$/);
  if (numUnitMatch) {
    return { value: numUnitMatch[1], unit: numUnitMatch[2] || undefined };
  }
  return { value: stripped };
}

export interface CalculationSymbol {
  symbol: string;
  description: string;
  unit?: string;
}

export type CalculationGivenSourceKind = 'user' | 'db' | 'datasheet_pdf' | 'web' | 'ai';
export interface CalculationGivenSource {
  kind: CalculationGivenSourceKind;
  label: string;
  url?: string;
}

export type FormulaSourceKind = 'standard' | 'manufacturer' | 'textbook' | 'ai';
export interface FormulaSource {
  label: string;
  url?: string;
  kind: FormulaSourceKind;
}

export interface CalculationGiven {
  name: string;
  value: string;
  unit: string;
  source?: CalculationGivenSource;
}

export interface CalculationSection {
  title: string;
  given: CalculationGiven[];
  formula?: string;
  legend?: CalculationSymbol[];
  steps: CalculationStep[];
  result: { name: string; value: string; unit: string };
  derived_specs: Array<{ label: string; value: string; unit?: string }>;
  summary: string;
  formula_sources?: FormulaSource[];
}

// Visual styling for source chips. The "user input" pill stays distinctly blue
// so an edited value pops visually; every AI-origin chip (`ai`, plus any
// unknown future kinds) shares the neutral gray style so they read as a single
// "source: AI" badge.
const AI_CHIP_STYLE = {
  icon: Sparkles,
  classes: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/60 dark:text-gray-400 dark:border-gray-700',
  defaultLabel: 'AI',
} as const;

const GIVEN_SOURCE_STYLES: Record<CalculationGivenSourceKind, { icon: typeof User; classes: string; defaultLabel: string }> = {
  user: { icon: User, classes: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700/40', defaultLabel: 'User input' },
  db: { icon: Database, classes: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700/40', defaultLabel: 'DeepFolder catalog' },
  datasheet_pdf: { icon: FileText, classes: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/40', defaultLabel: 'Datasheet' },
  web: { icon: Globe, classes: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-700/40', defaultLabel: 'Web' },
  ai: AI_CHIP_STYLE,
};

const FORMULA_SOURCE_STYLES: Record<FormulaSourceKind, { icon: typeof BookOpen; classes: string }> = {
  standard: { icon: BookOpen, classes: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700/40' },
  manufacturer: { icon: Building2, classes: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700/40' },
  textbook: { icon: BookOpen, classes: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/40' },
  ai: { icon: Sparkles, classes: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/60 dark:text-gray-400 dark:border-gray-700' },
};

function GivenSourceChip({ source }: { source: CalculationGivenSource }) {
  // Any AI-origin kind that isn't explicitly known falls back to the shared
  // neutral AI style — keeps "all AI sources look the same" per task #407.
  const style = GIVEN_SOURCE_STYLES[source.kind] || AI_CHIP_STYLE;
  const Icon = style.icon;
  const label = source.label || style.defaultLabel;
  const inner = (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${style.classes} max-w-[100px] sm:max-w-[180px] truncate`} title={label}>
      <Icon className="w-3 h-3 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
  if (source.url) {
    return (
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity" data-testid={`link-given-source-${source.kind}`}>
        {inner}
      </a>
    );
  }
  return inner;
}

function FormulaSourceChip({ source }: { source: FormulaSource }) {
  const style = FORMULA_SOURCE_STYLES[source.kind] || FORMULA_SOURCE_STYLES.ai;
  const Icon = style.icon;
  const inner = (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${style.classes}`} title={source.label}>
      <Icon className="w-3 h-3 shrink-0" />
      <span>{source.label}</span>
    </span>
  );
  if (source.url) {
    return (
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity" data-testid={`link-formula-source-${source.kind}`}>
        {inner}
      </a>
    );
  }
  return inner;
}

interface CalcCardProps {
  calculationSection: CalculationSection;
  onRegenerate?: (overrides: Record<string, string>) => void | Promise<void>;
  isRegenerating?: boolean;
  regenerateError?: string | null;
  calculationMode?: 'size_then_search' | 'search_then_size';
  /** Optional product name to reference in the "diverges from datasheet" note for search_then_size. */
  referenceProductName?: string;
}

export function CalcCard({ calculationSection, onRegenerate, isRegenerating, regenerateError, calculationMode, referenceProductName }: CalcCardProps) {
  // Per-row edited value, keyed by index in calculationSection.given. Reset
  // whenever the underlying section changes (i.e. after a successful
  // regeneration the parent passes back a fresh section).
  const [edits, setEdits] = useState<Record<number, string>>({});
  useEffect(() => { setEdits({}); }, [calculationSection]);

  const editable = !!onRegenerate;
  const hasEdits = Object.values(edits).some(v => v != null && v.trim().length > 0);

  const handleRegenerate = () => {
    if (!onRegenerate) return;
    const overrides: Record<string, string> = {};
    for (const [idxStr, val] of Object.entries(edits)) {
      const idx = Number(idxStr);
      const g = calculationSection.given[idx];
      if (!g) continue;
      const trimmed = (val ?? '').trim();
      if (!trimmed || trimmed === String(g.value ?? '').trim()) continue;
      overrides[g.name] = trimmed;
    }
    if (Object.keys(overrides).length === 0) return;
    void onRegenerate(overrides);
  };

  // For search_then_size, surface a note explaining that the recomputed result
  // no longer reflects the referenced product's datasheet for the changed
  // params.
  const userSourced = calculationSection.given.filter(g => g.source?.kind === 'user');
  const showDivergenceNote = calculationMode === 'search_then_size' && userSourced.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          <Calculator className="w-3.5 h-3.5 mr-2" />
          <span>Calculation</span>
        </div>
        {editable && (
          <div className="flex items-center gap-2">
            {isRegenerating && <OrbAnimation />}
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={!hasEdits || !!isRegenerating}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
              isRegenerating
                ? 'border-orange-300 dark:border-orange-600/60 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                : hasEdits
                  ? 'border-green-300 dark:border-green-700/50 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50'
                  : 'border-blue-200 dark:border-blue-700/50 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
            }`}
            data-testid="button-calc-regenerate"
            title={hasEdits ? 'Recalculate with your values' : 'Edit a value to enable Recalculate'}
          >
            {isRegenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            <span>{isRegenerating ? 'Recalculating…' : 'Recalculate'}</span>
          </button>
          </div>
        )}
      </div>

      {regenerateError && (
        <div className="mb-3 inline-flex items-start gap-1.5 px-2 py-1 rounded border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 text-[11px] text-red-700 dark:text-red-300">
          <X className="w-3 h-3 mt-0.5 shrink-0" />
          <span>{regenerateError}</span>
        </div>
      )}

      {calculationSection.title && (
        <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-3">{calculationSection.title}</div>
      )}

      {calculationSection.given?.length > 0 && (() => {
        const anySource = editable || calculationSection.given.some(g => g.source);
        return (
          <div className="mb-3">
            <div className="overflow-x-auto -mx-0.5 px-0.5">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                  <th className="text-left py-1.5 pr-3 font-semibold text-gray-600 dark:text-gray-300">Parameter</th>
                  <th className="text-left py-1.5 pr-3 font-semibold text-gray-600 dark:text-gray-300">Value</th>
                  {anySource && (
                    <th className="text-left py-1.5 font-semibold text-gray-600 dark:text-gray-300">Source</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {calculationSection.given.map((g, i) => {
                  const editVal = edits[i];
                  const originalVal = String(g.value ?? '');
                  const isEdited = editVal != null && editVal.trim().length > 0 && editVal.trim() !== originalVal.trim();
                  const effectiveSource: CalculationGivenSource | undefined = isEdited
                    ? { kind: 'user', label: 'User input' }
                    : g.source;
                  return (
                    <tr key={i} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                      <td className="py-1.5 pr-3 font-medium text-gray-700 dark:text-gray-300">
                        <MaybeMath content={g.name} />
                      </td>
                      <td className="py-1.5 pr-3 text-gray-900 dark:text-white">
                        {editable ? (
                          <span className="inline-flex items-baseline gap-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={editVal != null ? editVal : originalVal}
                              onChange={(e) => setEdits(prev => ({ ...prev, [i]: e.target.value }))}
                              disabled={!!isRegenerating}
                              className={`w-24 px-1.5 py-0.5 rounded border bg-white dark:bg-gray-900 text-xs text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500 ${isEdited ? 'border-blue-400 dark:border-blue-500 bg-blue-50/60 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600'}`}
                              data-testid={`input-given-value-${i}`}
                            />
                            {g.unit ? (
                              <span className="text-gray-700 dark:text-gray-300 font-normal">
                                <UnitMath unit={g.unit} />
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="whitespace-nowrap">
                            <MaybeMathValue content={g.value} />
                            {g.unit ? (
                              <span className="ml-1 text-gray-700 dark:text-gray-300 font-normal">
                                <UnitMath unit={g.unit} />
                              </span>
                            ) : null}
                          </span>
                        )}
                      </td>
                      {anySource && (
                        <td className="py-1.5 align-middle max-w-[120px] sm:max-w-[180px]" data-testid={`cell-given-source-${i}`}>
                          {effectiveSource ? <GivenSourceChip source={effectiveSource} /> : (
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        );
      })()}


      {calculationSection.legend?.length > 0 && (
        <div className="mb-3">
          <div className="overflow-x-auto -mx-0.5 px-0.5">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                <th className="text-left py-1.5 pr-3 font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">Symbol</th>
                <th className="text-left py-1.5 pr-3 font-semibold text-gray-600 dark:text-gray-300">Meaning</th>
                <th className="text-left py-1.5 font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">Unit</th>
              </tr>
            </thead>
            <tbody>
              {calculationSection.legend.map((sym, i) => (
                <tr key={i} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                  <td className="py-1.5 pr-3 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    <SymbolMath content={sym.symbol} />
                  </td>
                  <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-400 break-words min-w-0">{sym.description}</td>
                  <td className="py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {sym.unit && sym.unit.trim() ? <UnitMath unit={sym.unit} /> : <span>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {calculationSection.steps?.length > 0 && (
        <div className="mb-3">
          <div className="overflow-x-auto -mx-0.5 px-0.5">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                <th className="text-left py-1.5 pr-3 font-semibold text-gray-600 dark:text-gray-300 w-6">#</th>
                <th className="text-left py-1.5 pr-3 font-semibold text-gray-600 dark:text-gray-300">Step</th>
                <th className="text-right py-1.5 font-semibold text-gray-600 dark:text-gray-300 sm:whitespace-nowrap">Result</th>
              </tr>
            </thead>
            <tbody>
              {calculationSection.steps.map((step, i) => {
                const result = normalizeStepResult(step.result);
                const { header: labelHeader, mathRemainder: labelMath } = splitLabelAtMath(step.label);
                return (
                <tr key={i} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0 result-row-reveal" style={{ animationDelay: `${i * 80}ms` }}>
                  <td className="py-1.5 pr-3 text-gray-400 dark:text-gray-500 font-medium align-top">{i + 1}</td>
                  <td className="py-1.5 pr-3 align-top min-w-0 break-words">
                    {labelHeader && (
                      <div className="text-gray-700 dark:text-gray-300 mb-0.5">
                        <RichTextRenderer content={labelHeader} hideReferences />
                      </div>
                    )}
                    {labelMath && (
                      <div className="step-formula-cell text-sm text-gray-700 dark:text-gray-300 mb-0.5">
                        <RichTextRenderer content={injectDisplayStyle(labelMath)} hideReferences />
                      </div>
                    )}
                    {step.content && (
                      <div className="text-gray-600 dark:text-gray-400 mb-0.5">
                        <RichTextRenderer content={step.content} hideReferences />
                      </div>
                    )}
                    {step.formula && (
                      <div className="step-formula-cell text-sm text-gray-700 dark:text-gray-300">
                        <RichTextRenderer content={injectDisplayStyle(step.formula)} hideReferences />
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 text-sm text-right text-gray-700 dark:text-gray-300 sm:whitespace-nowrap align-top">
                    {result ? (() => {
                      const cleaned = cleanResultValue(result.value);
                      const unit = result.unit || cleaned.unit;
                      return (
                        <span className="sm:whitespace-nowrap">
                          <MaybeMathValue content={cleaned.value} />
                          {unit ? (
                            <span className="ml-1 text-gray-700 dark:text-gray-300 font-normal">
                              <UnitMath unit={unit} />
                            </span>
                          ) : null}
                        </span>
                      );
                    })() : ''}
                  </td>
                </tr>
                );
              })}
              {calculationSection.result?.value && (
                <tr className="border-t-2 border-gray-400 dark:border-gray-500">
                  <td className="py-2 pr-3 text-gray-400 dark:text-gray-500 font-medium align-middle" />
                  <td className="py-2 pr-3 font-semibold text-gray-700 dark:text-gray-300 align-middle">
                    {calculationSection.result.name ? <MaybeMath content={calculationSection.result.name} /> : 'Result'}
                  </td>
                  <td className="py-2 text-right align-middle">
                    {(() => {
                      const cleaned = cleanResultValue(calculationSection.result.value);
                      const unit = calculationSection.result.unit || cleaned.unit;
                      return (
                        <span className="sm:whitespace-nowrap">
                          <span className="text-gray-900 dark:text-white">
                            <MaybeMathValue content={cleaned.value} />
                          </span>
                          {unit && (
                            <span className="ml-1 font-medium text-gray-700 dark:text-gray-300">
                              <UnitMath unit={unit} />
                            </span>
                          )}
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {!calculationSection.steps?.length && calculationSection.result?.value && (() => {
        const cleaned = cleanResultValue(calculationSection.result.value);
        const unit = calculationSection.result.unit || cleaned.unit;
        return (
          <div className="flex items-center justify-between border-t-2 border-gray-400 dark:border-gray-500 pt-2 mb-3">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{calculationSection.result.name ? <MaybeMath content={calculationSection.result.name} /> : 'Result'}</span>
            <span className="sm:whitespace-nowrap">
              <span className="text-gray-900 dark:text-white">
                <MaybeMathValue content={cleaned.value} />
              </span>
              {unit && (
                <span className="ml-1 font-medium text-gray-700 dark:text-gray-300">
                  <UnitMath unit={unit} />
                </span>
              )}
            </span>
          </div>
        );
      })()}

      {calculationSection.formula_sources && calculationSection.formula_sources.length > 0 && (
        <div className="mb-3 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 px-3 py-2">
          <div className="flex items-start gap-2 flex-wrap" data-testid="container-formula-sources">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mt-1">Sources:</span>
            <div className="flex flex-wrap gap-1.5">
              {calculationSection.formula_sources.map((src, i) => (
                <FormulaSourceChip key={i} source={src} />
              ))}
            </div>
          </div>
        </div>
      )}

      {calculationSection.derived_specs?.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Search Specs Derived</div>
          <div className="flex flex-col items-start gap-1.5">
            {calculationSection.derived_specs.map((spec, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-700/30">
                <span className="font-semibold"><MaybeMath content={spec.label} />:</span>{' '}
                <MaybeMath content={spec.value} />
                {spec.unit ? (
                  <span className="text-purple-600 dark:text-purple-400 ml-0.5">
                    <UnitMath unit={spec.unit} />
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      )}

      {calculationSection.summary && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-green-300 dark:border-green-700 border-l-4 border-l-green-500 dark:border-l-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-2">
          <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-green-500 dark:text-green-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-[11px] font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide mb-0.5">Calculation Summary</p>
            <div className="text-[12px] leading-relaxed text-green-800 dark:text-green-300">
              <RichTextRenderer content={calculationSection.summary} hideReferences />
            </div>
          </div>
        </div>
      )}

      {showDivergenceNote && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-blue-300 dark:border-blue-700 border-l-4 border-l-blue-500 dark:border-l-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2" data-testid="note-search-then-size-divergence">
          <User className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-blue-500 dark:text-blue-400" />
          <p className="text-[10px] leading-relaxed text-blue-800 dark:text-blue-300">
            This calculation now reflects your input values for {userSourced.map(g => g.name).join(', ')}{referenceProductName ? <> rather than the values from <span className="font-semibold">{referenceProductName}</span>'s datasheet</> : null}.
          </p>
        </div>
      )}

      <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 dark:border-amber-700 border-l-4 border-l-amber-500 dark:border-l-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
        <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500 dark:text-amber-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        <p className="text-[10px] leading-relaxed text-amber-800 dark:text-amber-300">
          AI-generated calculations may contain errors. These calculations must be verified and approved by a qualified professional (engineer, scientist, or other relevant expert) before use in any real application.
        </p>
      </div>
    </div>
  );
}
