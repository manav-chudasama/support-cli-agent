/**
 * Retriever — given a ticket, retrieves the most relevant corpus chunks.
 * Handles domain routing (scoped vs cross-domain search).
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
): Promise<RetrievedChunk[]> {
  // Build query from issue + subject
  const query = [ticket.issue, ticket.subject].filter(Boolean).join("\n");

  if (ticket.company !== "None") {
    // Scoped search — search only within the relevant domain
    const domain = COMPANY_TO_DOMAIN[ticket.company];
    const results = await queryIndex(index, query, env.RETRIEVAL_TOP_K, domain);
    
    // If scoped search returns too few results, also try cross-domain
    if (results.length < 2) {
      const crossResults = await queryIndex(index, query, 4);
      // Merge, dedupe by filePath+chunkIndex
      const seen = new Set(results.map((r) => `${r.metadata.filePath}:${r.metadata.chunkIndex}`));
      for (const cr of crossResults) {
        const key = `${cr.metadata.filePath}:${cr.metadata.chunkIndex}`;
        if (!seen.has(key)) {
          results.push(cr);
          seen.add(key);
        }
      }
    }
    return results;
  }

  // Cross-domain search — company is None
  const results = await queryIndex(index, query, env.RETRIEVAL_TOP_K);
  return results;
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
        `Category: ${chunk.metadata.category}\n\n` +
        chunk.text
      );
    })
    .join("\n\n");
}
