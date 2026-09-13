import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const STEPS = [
  "Upload",
  "Extract",
  "Analyze",
  "Generate AI Layer",
  "Embed Intelligence",
  "Create DPF",
] as const;

interface StepTrackerProps {
  currentStep: number;
  done: boolean;
}

export default function StepTracker({ currentStep, done }: StepTrackerProps) {
  return (
    <div className="flex items-center gap-0 w-full overflow-x-auto py-2">
      {STEPS.map((label, i) => {
        const completed = done ? true : i < currentStep;
        const active = !done && i === currentStep;
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-1 min-w-[70px]">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center border-2 text-xs font-bold transition-all duration-300",
                  completed
                    ? "bg-blue-600 border-blue-600 text-white"
                    : active
                    ? "bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-950 dark:border-blue-400 dark:text-blue-300"
                    : "bg-gray-100 border-gray-300 text-gray-400 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-500"
                )}
              >
                {completed ? (
                  <Check className="w-4 h-4" />
                ) : active ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={cn(
                  "text-[10px] font-medium text-center leading-tight",
                  completed
                    ? "text-blue-600 dark:text-blue-400"
                    : active
                    ? "text-blue-700 dark:text-blue-300"
                    : "text-gray-400 dark:text-gray-500"
                )}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-0.5 w-6 flex-shrink-0 mx-1 transition-colors duration-300",
                  completed ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-700"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
