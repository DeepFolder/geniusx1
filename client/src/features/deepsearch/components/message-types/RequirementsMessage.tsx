import { Search, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AISearchMessage } from "../../types";

interface RequirementsMessageProps {
  message: AISearchMessage;
  isLoading?: boolean;
}

// Dot size/spacing patterns — pseudo-random but deterministic per position
const DOT_PATTERNS = {
  param: [3,2,3,2,2,3,2],
  value: [2,3,2,4,2,3,2,3,2,4,2,3,2,2,3,2],
  type:  [3,2,3,2,3],
};

function SkeletonDots({
  variant,
  rowIndex,
}: {
  variant: "param" | "value" | "type";
  rowIndex: number;
}) {
  const sizes = DOT_PATTERNS[variant];
  const baseDelay = rowIndex * 0.18;
  return (
    <div className="flex items-center gap-[3px] flex-wrap">
      {sizes.map((size, i) => (
        <span
          key={i}
          className={cn("skeleton-dot", {
            "skeleton-dot-param": variant === "param",
            "skeleton-dot-value": variant === "value",
            "skeleton-dot-type":  variant === "type",
          })}
          style={{
            width:  size + 1 + "px",
            height: size + 1 + "px",
            animationDelay: `${((baseDelay + i * 0.09) % 1.3).toFixed(2)}s`,
          }}
        />
      ))}
    </div>
  );
}

export function RequirementsMessage({ message, isLoading = false }: RequirementsMessageProps) {
  // Force skeleton rows while loading, even if data has already arrived in the stream
  const isSkeleton = isLoading || !message.requirements?.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          <Search className="w-3.5 h-3.5 mr-2" />
          {isSkeleton ? (
            <span className="blur-[3px] select-none">Requirements (—)</span>
          ) : (
            <>Requirements ({message.requirements!.length})</>
          )}
        </div>
        <span className={cn(
          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
          isSkeleton
            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-700/30 blur-[3px] select-none"
            : message.requirementsMode === 'build'
              ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border border-orange-200 dark:border-orange-700/30'
              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-700/30'
        )}>
          {message.requirementsMode === 'build' ? 'Build Mode' : 'Product Search'}
        </span>
      </div>
      {!isSkeleton && message.expertName && (
        <div className="flex items-center gap-1.5 mb-2 px-0.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border border-purple-200 dark:border-purple-700/30">
            <Compass className="w-3 h-3" />
            AI Expert: {message.expertName}
          </span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-300 dark:border-gray-600">
              <th className="text-left py-1.5 pr-3 font-semibold text-gray-600 dark:text-gray-300">Parameter</th>
              <th className="text-left py-1.5 pr-3 font-semibold text-gray-600 dark:text-gray-300">Requirement</th>
              <th className="text-left py-1.5 font-semibold text-gray-600 dark:text-gray-300">Type</th>
            </tr>
          </thead>
          <tbody>
            {isSkeleton
              ? [0, 1, 2, 3].map((i) => (
                  <tr key={i} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                    <td className="py-2 pr-3">
                      <SkeletonDots variant="param" rowIndex={i} />
                    </td>
                    <td className="py-2 pr-3">
                      <SkeletonDots variant="value" rowIndex={i} />
                    </td>
                    <td className="py-2">
                      <SkeletonDots variant="type" rowIndex={i} />
                    </td>
                  </tr>
                ))
              : message.requirements!.map((req, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-200 dark:border-gray-700 last:border-b-0 result-row-reveal"
                    style={{ animationDelay: `${i * 110}ms` }}
                  >
                    <td className="py-1.5 pr-3 font-medium">{req.parameter}</td>
                    <td
                      className={cn(
                        "py-1.5 pr-3 transition-[filter] duration-700 ease-out",
                        isLoading && "blur-[4px] select-none"
                      )}
                    >
                      {req.requirement}
                    </td>
                    <td
                      className={cn(
                        "py-1.5 transition-[filter] duration-700 ease-out",
                        isLoading && "blur-[4px] select-none"
                      )}
                    >
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-medium",
                        req.type === 'hard'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      )}>
                        {req.type}
                      </span>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
