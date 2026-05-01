/**
 * Configuration — environment variables with Zod validation and defaults.
 */

import { z } from "zod/v4";
import path from "path";
import { fileURLToPath } from "url";

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
  CONFIDENCE_THRESHOLD: z.coerce.number().default(0.35),
  ENABLE_LOGGING: z.string().default("true").transform((v) => v !== "false"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

// ── Absolute paths ─────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

export const paths = {
  dataDir: path.join(REPO_ROOT, "data"),
  supportTickets: path.join(REPO_ROOT, "support_tickets", "support_tickets.csv"),
  sampleTickets: path.join(REPO_ROOT, "support_tickets", "sample_support_tickets.csv"),
  outputCsv: path.join(REPO_ROOT, "support_tickets", "output.csv"),
  vectorIndex: path.join(REPO_ROOT, "data", "index"),
  logsDir: path.join(REPO_ROOT, "logs"),
};

// ── Domain constants ───────────────────────────────────────────────────
export const DOMAINS = ["claude", "hackerrank", "visa"] as const;
export type Domain = typeof DOMAINS[number];
