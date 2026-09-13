import { RichTextRenderer, collectLinkMap } from "@/components/chat/RichTextRenderer";
import type { ComparisonTableData, ComparisonCellSource } from "../types";

interface ComparisonTableRowsProps {
  data: ComparisonTableData;
  rowAnimDelayMs?: number;
}

export function ComparisonTableRows({ data, rowAnimDelayMs = 80 }: ComparisonTableRowsProps) {
  type SourceEntry = ComparisonCellSource & { id: string };
  const sourceList: SourceEntry[] = [];
  const sourceIndex = new Map<string, number>();

  const keyForSource = (s: ComparisonCellSource): string => {
    if (s.kind === 'web' && s.url) return `web:${s.url}`;
    return `${s.kind}:${(s.label ?? '').toLowerCase()}`;
  };

  const registerSource = (s: ComparisonCellSource | null | undefined): number | null => {
    if (!s) return null;
    const key = keyForSource(s);
    if (sourceIndex.has(key)) return sourceIndex.get(key)!;
    const idx = sourceList.length + 1;
    sourceList.push({ ...s, id: key });
    sourceIndex.set(key, idx);
    return idx;
  };

  const cellSourceNumbers: number[][][] = data.rows.map((row) => {
    const rowHasStructured = Array.isArray(row.valueSources) && row.valueSources.some(Boolean);
    return data.products.map((_p, pi) => {
      const nums: number[] = [];
      const seen = new Set<number>();
      const addNum = (n: number | null) => {
        if (n != null && !seen.has(n)) { seen.add(n); nums.push(n); }
      };
      if (rowHasStructured) {
        const src = row.valueSources?.[pi];
        addNum(registerSource(src ?? null));
      } else {
        const val = row.values[pi];
        if (val) {
          collectLinkMap(val).forEach((_n, href) => {
            addNum(registerSource({ kind: 'web', url: href }));
          });
        }
      }
      return nums;
    });
  });

  const labelForSource = (s: ComparisonCellSource): string => {
    if (s.kind === 'web') {
      if (s.label) return s.label;
      try { return new URL(s.url || '').hostname.replace(/^www\./, ''); } catch { return s.url || 'web'; }
    }
    if (s.kind === 'datasheet') return s.label || 'DeepFolder catalog datasheet';
    if (s.kind === 'database') return s.label || 'DeepFolder catalog';
    return s.label || 'AI engineering knowledge';
  };

  const collapseInlineBadges = sourceList.length === 1;

  const renderBadge = (n: number, extraMargin?: string) => {
    const src = sourceList[n - 1];
    if (!src) return null;
    const title = `${labelForSource(src)}${src.kind === 'web' && src.url ? ` — ${src.url}` : ''}`;
    const baseClass = `inline-flex items-center px-1 py-0.5 ${extraMargin ?? 'ml-1'} text-[10px] font-semibold leading-none rounded`;
    if (src.kind === 'web' && src.url) {
      return (
        <a key={n} href={src.url} target="_blank" rel="noopener noreferrer" title={title} className={`${baseClass} bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-800/40 hover:underline cursor-pointer transition-colors`}>[{n}]</a>
      );
    }
    const colorClass = src.kind === 'model_knowledge'
      ? 'text-amber-700 dark:text-amber-400'
      : 'text-gray-600 dark:text-gray-300';
    return (
      <span key={n} title={title} className={`${baseClass} ${colorClass}`}>[{n}]</span>
    );
  };

  return (
    <>
      {data.rows.map((row, ri) => (
        <tr key={ri} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors result-row-reveal" style={{ animationDelay: `${ri * rowAnimDelayMs}ms` }}>
          <td className="py-2 pr-4 font-medium text-gray-700 dark:text-gray-300">{row.parameter}</td>
          {data.products.map((_product, pi) => {
            const cellNums = cellSourceNumbers[ri][pi];
            const showCellBadges = !collapseInlineBadges;
            return (
              <td key={pi} className="py-2 pr-3 text-gray-600 dark:text-gray-400">
                <span><RichTextRenderer content={row.values[pi] ?? '—'} hideReferences stripExternalLinks /></span>
                {showCellBadges && cellNums.map((n) => renderBadge(n))}
              </td>
            );
          })}
        </tr>
      ))}
      <tr className="border-t-2 border-gray-300 dark:border-gray-600">
        <td colSpan={1 + data.products.length} className="py-2 pt-3">
          <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Sources</div>
          {sourceList.length === 0 ? (
            <div className="text-[10px] text-gray-500 dark:text-gray-400 italic">No sources cited for this comparison.</div>
          ) : (
            <div className="flex flex-col gap-y-1">
              {sourceList.map((src, i) => {
                const n = i + 1;
                if (src.kind === 'web' && src.url) {
                  const display = src.url.length > 80 ? src.url.slice(0, 80) + '…' : src.url;
                  return (
                    <a key={n} href={src.url} target="_blank" rel="noopener noreferrer" title={src.url} className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline">
                      [{n}] {display}
                    </a>
                  );
                }
                const colorClass = src.kind === 'model_knowledge'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-gray-600 dark:text-gray-400';
                return (
                  <span key={n} className={`text-[10px] ${colorClass}`}>
                    [{n}] {labelForSource(src)}
                  </span>
                );
              })}
            </div>
          )}
        </td>
      </tr>
    </>
  );
}
