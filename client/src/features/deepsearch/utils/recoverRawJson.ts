import type { BomItem } from "../types";

export function recoverRawJsonMessage(msg: any): any {
  if (msg.isUser || !msg.content) return msg;
  if (msg.searchResults?.bomTable || msg.searchResults?.products?.length) return msg;
  const content = msg.content.trim();
  if (!content.startsWith('{') || !content.includes('"bom_table"')) return msg;
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed.bom_table) && parsed.bom_table.length > 0) {
      return {
        ...msg,
        content: '',
        searchResults: {
          ...msg.searchResults,
          bomTable: parsed.bom_table.map((item: any) => ({
            part: item.part || '',
            spec: item.spec || '',
            qty: typeof item.qty === 'number' ? item.qty : 1,
            reason: item.reason || '',
          })),
          bomSummary: parsed.bom_summary || parsed.engineering_notes || '',
          engineeringNotes: parsed.engineering_notes || '',
        },
      };
    }
  } catch {
    const bomMatches: BomItem[] = [];
    const objRegex = /\{[^{}]*"part"\s*:\s*"([^"]*)"[^{}]*"spec"\s*:\s*"([^"]*)"[^{}]*"qty"\s*:\s*(\d+)[^{}]*"reason"\s*:\s*"([^"]*)"[^{}]*\}/g;
    let match;
    while ((match = objRegex.exec(content)) !== null) {
      bomMatches.push({ part: match[1], spec: match[2], qty: parseInt(match[3], 10), reason: match[4] });
    }
    if (bomMatches.length > 0) {
      return {
        ...msg,
        content: '',
        searchResults: { ...msg.searchResults, bomTable: bomMatches, bomSummary: '', engineeringNotes: '' },
      };
    }
  }
  return msg;
}
