/**
 * Confidence Scoring — deterministic 0-1 score from pipeline signals.
 * No LLM calls. Pure math from retrieval quality + classification output.
 */

import type { Classification, RetrievedChunk, ConfidenceScore } from "./schemas.js";
import { env } from "./config.js";

const RISK_PENALTY: Record<string, number> = {
  low: 0.0,
  medium: 0.05,
  high: 0.15,
  critical: 0.30,
};

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function computeConfidence(
  chunks: RetrievedChunk[],
  classification: Classification,
): ConfidenceScore {
  // Retrieval quality: average score of top-3 chunks (0 if no chunks)
  const top3 = chunks.slice(0, 3);
  const retrievalQuality = top3.length > 0
    ? top3.reduce((sum, c) => sum + c.score, 0) / top3.length
    : 0;

  // Corpus coverage: did the classifier think it can answer from corpus?
  const corpusCoverage = classification.can_answer_from_corpus ? 1.0 : 0.5;

  // Risk penalty: higher risk = lower confidence ceiling
  const riskPenalty = RISK_PENALTY[classification.risk_level] ?? 0;

  // Chunk count bonus: more relevant chunks = higher confidence
  const chunkBonus = Math.min(chunks.length / env.RETRIEVAL_TOP_K, 1.0) * 0.1;

  // Composite score
  const raw = (retrievalQuality * 0.5) + (corpusCoverage * 0.4) + chunkBonus - riskPenalty;
  const score = clamp(raw, 0.0, 1.0);

  // Confidence level
  let level: ConfidenceScore["level"];
  if (score >= 0.70) level = "high";
  else if (score >= 0.50) level = "medium";
  else if (score >= 0.35) level = "low";
  else level = "very_low";

  return {
    score: Math.round(score * 1000) / 1000,
    level,
    breakdown: {
      retrievalQuality: Math.round(retrievalQuality * 1000) / 1000,
      corpusCoverage,
      riskPenalty,
      chunkCount: chunks.length,
    },
  };
}

export function isBelowThreshold(confidence: ConfidenceScore): boolean {
  return confidence.level === "very_low";
}
