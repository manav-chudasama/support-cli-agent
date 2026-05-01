/**
 * Zod schemas for all data structures used across the pipeline.
 */

import { z } from "zod/v4";

// ── Input ticket from CSV ──────────────────────────────────────────────
export const TicketInputSchema = z.object({
  Issue: z.string().min(1),
  Subject: z.string().default(""),
  Company: z.string().default("None"),
});
export type TicketInput = z.infer<typeof TicketInputSchema>;

// ── Normalized ticket for pipeline processing ──────────────────────────
export const NormalizedTicketSchema = z.object({
  issue: z.string(),
  subject: z.string(),
  company: z.enum(["HackerRank", "Claude", "Visa", "None"]),
  index: z.number(),
});
export type NormalizedTicket = z.infer<typeof NormalizedTicketSchema>;

// ── Corpus chunk metadata ──────────────────────────────────────────────
export const ChunkMetadataSchema = z.object({
  domain: z.enum(["claude", "hackerrank", "visa"]),
  title: z.string(),
  category: z.string(),
  filePath: z.string(),
  chunkIndex: z.number(),
});
export type ChunkMetadata = z.infer<typeof ChunkMetadataSchema>;

// ── Retrieved context for a ticket ─────────────────────────────────────
export interface RetrievedChunk {
  text: string;
  score: number;
  metadata: ChunkMetadata;
}

// ── LLM classification output ──────────────────────────────────────────
export const ClassificationSchema = z.object({
  request_type: z.enum(["product_issue", "feature_request", "bug", "invalid"]),
  product_area: z.string().min(1),
  risk_level: z.enum(["low", "medium", "high", "critical"]),
  escalation_reasons: z.array(z.string()),
  can_answer_from_corpus: z.boolean(),
  reasoning: z.string(),
});
export type Classification = z.infer<typeof ClassificationSchema>;

// ── Final output row ───────────────────────────────────────────────────
export const OutputRowSchema = z.object({
  issue: z.string(),
  subject: z.string(),
  company: z.string(),
  response: z.string().min(1),
  product_area: z.string().min(1),
  status: z.enum(["replied", "escalated"]),
  request_type: z.enum(["product_issue", "feature_request", "bug", "invalid"]),
  justification: z.string().min(1),
});
export type OutputRow = z.infer<typeof OutputRowSchema>;
