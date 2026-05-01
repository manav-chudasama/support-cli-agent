/**
 * Zod schemas and TypeScript types for all data structures in the pipeline.
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

// ── F1: Safety Guard ───────────────────────────────────────────────────
export interface SafetyResult {
  safe: boolean;
  flagType: "injection" | "jailbreak" | "adversarial" | null;
  flagDetail: string | null;
  sanitizedIssue: string;
}

// ── F2: Multi-request Decomposition ────────────────────────────────────
export interface SubRequest {
  text: string;
  focus: string;
}

export interface DecompositionResult {
  isCompound: boolean;
  subRequests: SubRequest[];
}

// ── F3: Query Expansion ────────────────────────────────────────────────
export interface ExpandedQueries {
  queries: string[];
  detectedLanguage: string | null;
}

// ── F5: Confidence Scoring ─────────────────────────────────────────────
export interface ConfidenceScore {
  score: number;   // 0.0 – 1.0
  level: "high" | "medium" | "low" | "very_low";
  breakdown: {
    retrievalQuality: number;
    corpusCoverage: number;
    riskPenalty: number;
    chunkCount: number;
  };
}

// ── F6: Structured Logging ─────────────────────────────────────────────
export interface SubRequestLog {
  focus: string;
  text: string;
  expandedQueries: string[];
  detectedLanguage: string | null;
  retrievedChunks: Array<{
    title: string;
    domain: string;
    filePath: string;
    score: number;
    snippet: string;
  }>;
  classification: Classification;
  confidence: ConfidenceScore;
  escalation: {
    shouldEscalate: boolean;
    reasons: string[];
  };
  response: string;
  justification: string;
}

export interface TicketLog {
  ticketIndex: number;
  timestamp: string;
  input: {
    issue: string;
    subject: string;
    company: string;
  };
  safety: SafetyResult;
  decomposition: DecompositionResult;
  subRequests: SubRequestLog[];
  output: OutputRow;
  timing: {
    totalMs: number;
    safetyMs: number;
    decompositionMs: number;
    expansionMs: number;
    retrievalMs: number;
    classificationMs: number;
    confidenceMs: number;
    responseMs: number;
  };
}

export interface SummaryLog {
  runTimestamp: string;
  totalTickets: number;
  replied: number;
  escalated: number;
  compoundTickets: number;
  safetyFlagged: number;
  avgConfidenceScore: number;
  durationMs: number;
  byCompany: Record<string, number>;
  byRequestType: Record<string, number>;
  byConfidenceLevel: Record<string, number>;
}
