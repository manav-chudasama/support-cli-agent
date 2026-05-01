/**
 * Retriever — given a ticket + expanded queries, retrieves the most relevant corpus chunks.
 * Supports multi-query retrieval: fetches for each query, merges, deduplicates, re-ranks.
 */

import type { LocalIndex } from "vectra";
import { queryIndex } from "./indexer.js";
import type { NormalizedTicket, RetrievedChunk } from "./schemas.js";
import { env } from "./config.js";

// Map company names to domain corpus names
const COMPANY_TO_DOMAIN: Record<string, string> = {
  HackerRank: "hackerrank",
  Claude: "claude",
  Visa: "visa",
};

export async function retrieve(
  index: LocalIndex,
  ticket: NormalizedTicket,
  expandedQueries?: string[],
): Promise<RetrievedChunk[]> {
  // Build query list: use expanded queries if provided, else fall back to raw issue+subject
  const queries: string[] = (expandedQueries && expandedQueries.length > 0)
    ? expandedQueries
    : [[ticket.issue, ticket.subject].filter(Boolean).join("\n")];

  const domain = ticket.company !== "None" ? COMPANY_TO_DOMAIN[ticket.company] : undefined;

  // Collect results from all queries
  const seen = new Map<string, RetrievedChunk>(); // key = filePath:chunkIndex

  for (const query of queries) {
    const results = domain
      ? await queryIndex(index, query, env.RETRIEVAL_TOP_K, domain)
      : await queryIndex(index, query, env.RETRIEVAL_TOP_K);

    for (const chunk of results) {
      const key = `${chunk.metadata.filePath}:${chunk.metadata.chunkIndex}`;
      const existing = seen.get(key);
      // Keep highest score if same chunk retrieved by multiple queries
      if (!existing || chunk.score > existing.score) {
        seen.set(key, chunk);
      }
    }
  }

  // If scoped search returned too few, supplement with cross-domain
  if (domain && seen.size < 2) {
    const fallbackQuery = queries[0]!;
    const crossResults = await queryIndex(index, fallbackQuery, 4);
    for (const chunk of crossResults) {
      const key = `${chunk.metadata.filePath}:${chunk.metadata.chunkIndex}`;
      if (!seen.has(key)) {
        seen.set(key, chunk);
      }
    }
  }

  // Sort by score descending, return top-K
  return [...seen.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, env.RETRIEVAL_TOP_K);
}

// Format retrieved chunks as context for LLM prompts
export function formatContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "No relevant support documentation was found in the corpus.";
  }

  return chunks
    .map((chunk, i) => {
      return (
        `--- Document ${i + 1} (relevance: ${(chunk.score * 100).toFixed(1)}%) ---\n` +
        `Source: [${chunk.metadata.domain}] ${chunk.metadata.title}\n` +
        `File: ${chunk.metadata.filePath}\n` +
        `Category: ${chunk.metadata.category}\n\n` +
        chunk.text
      );
    })
    .join("\n\n");
}

// Extract source citations for use in justification
export function extractCitations(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";
  const unique = [...new Map(chunks.map((c) => [c.metadata.filePath, c])).values()];
  return unique.slice(0, 3).map((c) => `[${c.metadata.title}]`).join(", ");
}
