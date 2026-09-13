import { Settings2, Lightbulb, Search } from "lucide-react";
import { EngineeringNotes } from "../EngineeringNotes";
import type { AISearchMessage } from "../../types";

interface BomTableMessageProps {
  message: AISearchMessage;
  onSearchBomItem: (query: string) => void;
}

export function BomTableMessage({ message, onSearchBomItem }: BomTableMessageProps) {
  return (
    <div>
      <div className="flex items-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
        <Settings2 className="w-3.5 h-3.5 mr-2" />
        Search Results ({message.bomTable!.length} parts)
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-300 dark:border-gray-600">
              <th className="text-left py-1.5 pr-3 font-semibold text-gray-600 dark:text-gray-300">#</th>
              <th className="text-left py-1.5 pr-3 font-semibold text-gray-600 dark:text-gray-300">Part</th>
              <th className="text-left py-1.5 pr-3 font-semibold text-gray-600 dark:text-gray-300">Specification</th>
              <th className="text-center py-1.5 pr-3 font-semibold text-gray-600 dark:text-gray-300">Qty</th>
              <th className="text-left py-1.5 pr-3 font-semibold text-gray-600 dark:text-gray-300 hidden md:table-cell">Why</th>
              <th className="text-center py-1.5 font-semibold text-gray-600 dark:text-gray-300">Find</th>
            </tr>
          </thead>
          <tbody>
            {message.bomTable!.map((item, i) => (
              <tr
                key={i}
                className="border-b border-gray-200 dark:border-gray-700 last:border-b-0 result-row-reveal"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <td className="py-2 pr-3 text-gray-400 font-medium">{i + 1}</td>
                <td className="py-2 pr-3 font-semibold text-gray-900 dark:text-white">{item.part}</td>
                <td className="py-2 pr-3 text-gray-600 dark:text-gray-400">{item.spec}</td>
                <td className="py-2 pr-3 text-center font-bold text-blue-600 dark:text-blue-400">{item.qty}</td>
                <td className="py-2 pr-3 text-gray-500 dark:text-gray-500 hidden md:table-cell text-[11px]">{item.reason}</td>
                <td className="py-2 text-center">
                  <button
                    onClick={() => onSearchBomItem(`${item.part} ${item.spec}`)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-700/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                  >
                    <Search className="w-2.5 h-2.5" />
                    Find
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(message.bomSummary || message.engineeringNotes) && (
        <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-4">
          {message.bomSummary && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">AI Summary</span>
              </div>
              <EngineeringNotes content={message.bomSummary} skipAnimation={message.isFromHistory} />
            </div>
          )}
          {message.engineeringNotes && (
            <div className="rounded-lg border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50/50 dark:bg-indigo-950/20 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Settings2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">AI Recommendation</span>
              </div>
              <EngineeringNotes content={message.engineeringNotes} skipAnimation={message.isFromHistory} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
