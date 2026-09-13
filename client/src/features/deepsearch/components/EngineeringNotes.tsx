import { RichTextRenderer } from "@/components/chat/RichTextRenderer";
import type { ENBlock } from "../types";

interface EngineeringNotesProps {
  content: string;
  skipAnimation?: boolean;
}

export function EngineeringNotes({ content, skipAnimation = false }: EngineeringNotesProps) {
  const blocks: ENBlock[] = [];
  const lines = content.split('\n');
  let hasStructure = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    const headerMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
    const boldHeaderMatch = !headerMatch && trimmed.match(/^\*\*(.+?)\*\*:?\s*$/);
    const numberedHeaderMatch = !headerMatch && !boldHeaderMatch && trimmed.match(/^\d+[\.\)]\s*\*?\*?(.+?)\*?\*?\s*$/);
    const bulletMatch = trimmed.match(/^[-•*]\s+(.+)$/);
    const isTableRow = trimmed.startsWith('|') && trimmed.endsWith('|');
    const nextTrimmed = i + 1 < lines.length ? lines[i + 1].trim() : '';
    const nextIsSeparator = /^\|[\s:]*-+[\s:]*(\|[\s:]*-+[\s:]*)*\|$/.test(nextTrimmed);

    if (isTableRow && nextIsSeparator) {
      hasStructure = true;
      const last = blocks[blocks.length - 1];
      let tableTitle = '';
      if (last?.type === 'bullets' && last.bullets.length === 0) {
        tableTitle = last.title;
        blocks.pop();
      }
      const tableBlock = { type: 'table' as const, title: tableTitle, rawLines: [trimmed] };
      i++;
      tableBlock.rawLines.push(lines[i].trim());
      i++;
      while (i < lines.length) {
        const rowTrimmed = lines[i].trim();
        if (!rowTrimmed.startsWith('|') || !rowTrimmed.endsWith('|')) break;
        tableBlock.rawLines.push(rowTrimmed);
        i++;
      }
      i--;
      blocks.push(tableBlock);
    } else if (headerMatch || boldHeaderMatch || numberedHeaderMatch) {
      hasStructure = true;
      const title = (headerMatch?.[1] || boldHeaderMatch?.[1] || numberedHeaderMatch?.[1] || '').trim();
      blocks.push({ type: 'bullets', title, bullets: [] });
    } else if (bulletMatch) {
      const last = blocks[blocks.length - 1];
      if (last?.type === 'bullets') {
        last.bullets.push(bulletMatch[1]);
      } else {
        hasStructure = true;
        blocks.push({ type: 'bullets', title: '', bullets: [bulletMatch[1]] });
      }
    } else {
      const last = blocks[blocks.length - 1];
      if (last?.type === 'bullets') {
        last.bullets.push(trimmed);
      } else if (last?.type === 'prose') {
        last.lines.push(trimmed);
      } else {
        blocks.push({ type: 'prose', lines: [trimmed] });
      }
    }
  }

  if (!hasStructure) {
    return (
      <div className="text-xs md:text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <RichTextRenderer content={content} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, idx) => {
        if (block.type === 'table') {
          const [headerLine, , ...dataLines] = block.rawLines;
          const headers = headerLine.split('|').slice(1, -1).map(c => c.trim());
          const rows = dataLines.map(row => row.split('|').slice(1, -1).map(c => c.trim()));
          return (
            <div key={idx} className="pl-1 overflow-x-auto">
              {block.title && (
                <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1.5">{block.title.replace(/\*\*/g, '')}</div>
              )}
              <table className="w-full text-xs border-collapse border border-gray-200 dark:border-gray-700">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800">
                    {headers.map((h, hIdx) => (
                      <th key={hIdx} className="px-2 py-1.5 text-left font-semibold text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 whitespace-nowrap">
                        <RichTextRenderer content={h} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-2 py-1.5 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                          <RichTextRenderer content={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.type === 'prose') {
          return (
            <div key={idx} className="text-xs md:text-sm leading-relaxed text-gray-700 dark:text-gray-300">
              <RichTextRenderer content={block.lines.join(' ')} />
            </div>
          );
        }
        if (block.bullets.length === 0) return null;
        return (
          <div key={idx} className="pl-1">
            {block.title && (
              <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1.5">{block.title.replace(/\*\*/g, '')}</div>
            )}
            <ul className="space-y-1 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
              {block.bullets.map((bullet, bIdx) => (
                <li key={bIdx} className="flex items-start gap-2 text-xs md:text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                  <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0 bg-gray-400 dark:bg-gray-500" />
                  <span><RichTextRenderer content={bullet} /></span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
