import type { SourceDescription, Sentence, TimelineEntry } from "../types";

/**
 * Matches descriptions to sentences based on time overlap.
 * Each description shows only once - on the first sentence it overlaps with
 * in timeline order.
 */
export function matchDescriptionsToSentences(
  entries: TimelineEntry[],
  sentences: Map<string, Sentence>,
  descriptionsBySource: Map<string, SourceDescription[]>
): Map<string, string> {
  const result = new Map<string, string>();
  const usedDescriptions = new Set<string>();

  // Process entries in timeline order
  for (const entry of entries) {
    if (entry.excluded) continue;

    const sentence = sentences.get(entry.sentenceId);
    if (!sentence) continue;

    const descriptions = descriptionsBySource.get(sentence.sourceId);
    if (!descriptions || descriptions.length === 0) continue;

    // Find a description that overlaps with this sentence and hasn't been used
    for (const desc of descriptions) {
      // Create a unique key for this description
      const descKey = `${sentence.sourceId}:${desc.start}:${desc.end}`;

      if (usedDescriptions.has(descKey)) continue;

      // Check if description overlaps with sentence
      // Description overlaps if: desc.start <= sentence.startTime < desc.end
      if (desc.start <= sentence.startTime && sentence.startTime < desc.end) {
        result.set(sentence.sentenceId, desc.description);
        usedDescriptions.add(descKey);
        break; // Only one description per sentence
      }
    }
  }

  return result;
}
