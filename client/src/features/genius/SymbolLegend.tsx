import { UnitMath, SymbolMath } from "@/components/chat/MathHelpers";
import type { GeniusCalculationDoc } from "./types";

interface Entry {
  symbol: string;
  meaning: string;
  unit?: string;
}

function buildEntries(doc: GeniusCalculationDoc): Entry[] {
  const seen = new Set<string>();
  const out: Entry[] = [];
  const push = (symbol?: string, meaning?: string, unit?: string) => {
    const s = (symbol || "").trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push({ symbol: s, meaning: meaning || "", unit: unit || undefined });
  };
  doc.inputs.forEach((i) => push(i.symbol, i.label, i.unit));
  doc.assumptions.forEach((a) => push(a.symbol, a.label, a.unit));
  doc.steps.forEach((s) => push(s.symbol, s.title, s.unit));
  return out;
}

export function SymbolLegend({ doc }: { doc: GeniusCalculationDoc }) {
  const entries = buildEntries(doc);
  if (entries.length === 0) return null;

  return (
    <div>
      <div className="scrollbar-x-thin overflow-x-auto -mx-1 px-1">
      <table className="worksheet-aligned-table worksheet-symbol-legend w-full border-collapse table-fixed text-sm">
        <colgroup>
          {/* Must match InputsTable so Meaning shares Parameter's left guide. */}
          <col className="worksheet-symbol-column" />
          <col className="worksheet-parameter-column" />
          <col className="worksheet-legend-unit-column" />
        </colgroup>
        <thead>
          <tr className="border-b-2 border-gray-300 dark:border-gray-600">
            <th className="worksheet-symbol-cell whitespace-nowrap py-1.5 pr-2 sm:pr-6 text-left font-semibold text-gray-500 dark:text-gray-400 text-xs">Symbol</th>
            <th className="worksheet-parameter-cell py-1.5 pr-2 sm:pr-6 text-left font-semibold text-gray-500 dark:text-gray-400 text-xs">Meaning</th>
            <th className="whitespace-nowrap py-1.5 text-right font-semibold text-gray-500 dark:text-gray-400 text-xs">Unit</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.symbol} className="border-b border-gray-100 dark:border-white/[0.04] last:border-b-0">
              <td className="worksheet-symbol-cell whitespace-nowrap py-1.5 pr-2 sm:pr-6 font-medium text-xs text-gray-800 dark:text-gray-200">
                <SymbolMath content={e.symbol} />
              </td>
              <td className="worksheet-parameter-cell min-w-0 break-words py-1.5 pr-2 sm:pr-6 text-gray-500 dark:text-gray-400 text-xs">{e.meaning}</td>
              <td className="whitespace-nowrap py-1.5 text-right text-gray-500 dark:text-gray-400 text-xs">
                {e.unit && e.unit.trim() ? <UnitMath unit={e.unit} /> : <span className="text-gray-300 dark:text-gray-600">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
