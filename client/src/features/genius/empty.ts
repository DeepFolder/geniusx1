import type { GeniusCalculationDoc } from "./types";

// A blank worksheet. Genius X1 starts empty — no example is preloaded. The user
// describes a problem in the chat to generate the first calculation, and "New
// calculation" resets back to this.
export const EMPTY_DOC: GeniusCalculationDoc = {
  projectTitle: "New Calculation",
  problemStatement: "",
  inputs: [],
  assumptions: [],
  steps: [],
  results: [],
  references: [],
  confidence: { score: 0, explanation: "", factors: [] },
  visualizations: [],
  expertSummary: "",
  recommendations: [],
  versions: [],
};

// True when the worksheet has nothing to show yet.
export function isEmptyDoc(doc: GeniusCalculationDoc): boolean {
  return (
    doc.inputs.length === 0 &&
    doc.assumptions.length === 0 &&
    doc.steps.length === 0 &&
    doc.results.length === 0
  );
}
