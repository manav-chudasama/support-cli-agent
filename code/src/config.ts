/**
 * Central configuration — reads from environment variables (Bun auto-loads .env).
 * Never hardcode secrets here.
 */

import { z } from "zod/v4";
import path from "path";

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().default("gpt-4o"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  EMBEDDING_DIMENSIONS: z.coerce.number().default(1536),
  RETRIEVAL_TOP_K: z.coerce.number().default(8),
  RETRIEVAL_THRESHOLD: z.coerce.number().default(0.50),
  CLASSIFICATION_TEMPERATURE: z.coerce.number().default(0),
  RESPONSE_TEMPERATURE: z.coerce.number().default(0.2),
  CHUNK_SIZE: z.coerce.number().default(500),
  CHUNK_OVERLAP: z.coerce.number().default(50),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment configuration:");
  console.error(parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n"));
  process.exit(1);
}

export const env = parsed.data;

// Resolved paths relative to repo root
const REPO_ROOT = path.resolve(import.meta.dir, "..", "..");

export const paths = {
  repoRoot: REPO_ROOT,
  dataDir: path.join(REPO_ROOT, "data"),
  corpusClaude: path.join(REPO_ROOT, "data", "claude"),
  corpusHackerRank: path.join(REPO_ROOT, "data", "hackerrank"),
  corpusVisa: path.join(REPO_ROOT, "data", "visa"),
  vectorIndex: path.join(REPO_ROOT, "data", "index"),
  supportTickets: path.join(REPO_ROOT, "support_tickets", "support_tickets.csv"),
  sampleTickets: path.join(REPO_ROOT, "support_tickets", "sample_support_tickets.csv"),
  outputCsv: path.join(REPO_ROOT, "support_tickets", "output.csv"),
} as const;

export const DOMAINS = ["claude", "hackerrank", "visa"] as const;
export type Domain = (typeof DOMAINS)[number];
