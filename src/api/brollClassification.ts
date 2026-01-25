import { useProjectStore } from "../stores/useProjectStore";
import type { BrollClassification, BrollReason } from "../types";

/**
 * Classify a sentence as B-roll footage.
 */
export function classifyAsBroll(
  sentenceId: string,
  reason: BrollReason,
  confidence: number = 0.8
): void {
  const classification: BrollClassification = {
    sentenceId,
    isBroll: true,
    reason,
    confidence,
  };
  useProjectStore.getState().setBrollClassifications([classification]);
}

/**
 * Get the B-roll classification for a sentence, or null if not classified.
 */
export function getBrollStatus(sentenceId: string): BrollClassification | null {
  return useProjectStore.getState().brollClassifications.get(sentenceId) ?? null;
}

/**
 * Check if a sentence is classified as B-roll.
 */
export function isBroll(sentenceId: string): boolean {
  const classification = getBrollStatus(sentenceId);
  return classification?.isBroll ?? false;
}
