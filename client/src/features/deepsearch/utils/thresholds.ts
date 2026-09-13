import type { Requirement } from "../types";

export const STRONG_MATCH_THRESHOLD = 85;

export function getMatchThreshold(requirements?: Requirement[]): number {
  const hasHard = !!requirements && requirements.some(r => r.type === 'hard');
  return hasHard ? 70 : 50;
}
