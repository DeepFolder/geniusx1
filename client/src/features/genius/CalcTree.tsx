import { useState } from "react";
import {
  ChevronRight,
  Sliders,
  Calculator,
  CheckCircle2,
  BarChart3,
  Link2,
  ListTree,
  BookOpen,
  Lightbulb,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { GeniusCalculationDoc } from "./types";

interface Props {
  doc: GeniusCalculationDoc;
  onNavigate: (id: string) => void;
}

function Row({
  icon: Icon,
  label,
  onClick,
  depth = 0,
}: {
  icon?: LucideIcon;
  label: string;
  onClick: () => void;
  depth?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ paddingLeft: 8 + depth * 16 }}
      className="flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-xs text-gray-500 dark:text-gray-400 transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.05] hover:text-gray-800 dark:hover:text-white"
    >
      {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0 text-blue-500 dark:text-blue-400" />}
      <span className="truncate">{label}</span>
    </button>
  );
}

export function CalcTree({ doc, onNavigate }: Props) {
  const [stepsOpen, setStepsOpen] = useState(true);
  const hasInputs = doc.inputs.length + doc.assumptions.length > 0;
  const hasExpertSummary = !!(doc.expertSummary?.trim()) || !!(doc.confidence && doc.confidence.score > 0);
  const hasRecommendations = doc.recommendations && doc.recommendations.length > 0;
  const hasReferences = doc.references.length > 0;

  return (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06]">
        <ListTree className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Outline</h2>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {hasInputs && (
          <Row icon={Sliders} label="Input Values" onClick={() => onNavigate("section-inputs")} />
        )}

        {doc.steps.length > 0 && (
          <div>
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setStepsOpen((o) => !o)}
                className="flex h-7 w-6 flex-shrink-0 items-center justify-center rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                aria-label={stepsOpen ? "Collapse steps" : "Expand steps"}
              >
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${stepsOpen ? "rotate-90" : ""}`} />
              </button>
              <button
                type="button"
                onClick={() => onNavigate("section-steps")}
                className="flex flex-1 items-center gap-2 rounded-md py-1.5 pr-2 text-left text-xs text-gray-500 dark:text-gray-400 transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.05] hover:text-gray-800 dark:hover:text-white"
              >
                <Calculator className="h-3.5 w-3.5 flex-shrink-0 text-blue-500 dark:text-blue-400" />
                <span className="truncate">Calculation Steps</span>
              </button>
            </div>
            {stepsOpen && (
              <div className="mt-0.5 space-y-0.5 border-l border-gray-300/50 dark:border-white/[0.08] pl-2 ml-3">
                {doc.steps.map((step, i) => (
                  <Row
                    key={step.id}
                    label={`${i + 1}. ${step.title}`}
                    onClick={() => onNavigate(`step-${step.id}`)}
                    depth={0}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {doc.results.length > 0 && (
          <Row icon={CheckCircle2} label="Results" onClick={() => onNavigate("section-results")} />
        )}
        {doc.visualizations.some((v) => v.type === "chart") && (
          <Row icon={BarChart3} label="Charts" onClick={() => onNavigate("section-charts")} />
        )}
        {hasReferences && (
          <Row icon={Link2} label="References" onClick={() => onNavigate("section-refs")} />
        )}
        {hasExpertSummary && (
          <Row icon={BookOpen} label="AI Summary" onClick={() => onNavigate("section-expert-summary")} />
        )}
        {hasRecommendations && (
          <Row icon={Lightbulb} label="AI Recommendations" onClick={() => onNavigate("section-recommendations")} />
        )}
      </div>
    </nav>
  );
}
