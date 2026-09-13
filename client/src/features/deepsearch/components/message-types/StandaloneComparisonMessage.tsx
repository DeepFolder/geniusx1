import { SlidersHorizontal } from "lucide-react";
import { ComparisonTableRows } from "../ComparisonTableRows";
import type { AISearchMessage } from "../../types";

interface StandaloneComparisonMessageProps {
  message: AISearchMessage;
}

export function StandaloneComparisonMessage({ message }: StandaloneComparisonMessageProps) {
  return (
    <div>
      <div className="flex items-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
        <SlidersHorizontal className="w-3.5 h-3.5 mr-2" />
        Comparison ({message.comparisonTable!.products.length} products)
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-300 dark:border-gray-600">
              <th className="text-left py-1.5 pr-4 font-semibold text-gray-600 dark:text-gray-300 min-w-[120px]">Parameter</th>
              {message.comparisonTable!.products.map((product, pi) => (
                <th key={pi} className="text-left py-1.5 pr-3 font-semibold text-gray-600 dark:text-gray-300 min-w-[100px]">{product}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <ComparisonTableRows data={message.comparisonTable!} rowAnimDelayMs={80} />
          </tbody>
        </table>
      </div>
    </div>
  );
}
