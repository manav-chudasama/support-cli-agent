/**
 * Indexer — embeds corpus chunks and stores them in a vectra local index.
 * Caches the index to data/index/ for fast reuse.
 */

import { LocalIndex } from "vectra";
import OpenAI from "openai";
import fs from "fs";
import { env, paths } from "./config.js";
import type { CorpusChunk } from "./corpus-loader.js";
import type { ChunkMetadata } from "./schemas.js";
import { createSpinner, success, info } from "./ui.js";

let openai: OpenAI;

function getClient(): OpenAI {
  if (!openai) openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return openai;
}

// ── Build or load the vector index ─────────────────────────────────────
export async function buildIndex(chunks: CorpusChunk[]): Promise<LocalIndex> {
  const index = new LocalIndex(paths.vectorIndex);

  // Check if index already exists
  if (await index.isIndexCreated()) {
    const stats = await index.getIndexStats();
    if (stats.items > 0) {
      info(`Loaded cached index with ${stats.items} vectors`);
      return index;
    }
  }

  // Create fresh index
  await index.createIndex();
  const spinner = createSpinner("Embedding corpus chunks...");
  spinner.start();

  const BATCH_SIZE = 100;
  let processed = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => c.text);

    // Get embeddings
    const response = await getClient().embeddings.create({
      model: env.OPENAI_EMBEDDING_MODEL,
      input: texts,
    });

    // Insert into index
    for (let j = 0; j < batch.length; j++) {
      const embedding = response.data[j];
      const chunk = batch[j];
      if (!embedding || !chunk) continue;
      await index.insertItem({
        vector: embedding.embedding,
        metadata: {
          text: chunk.text,
          ...chunk.metadata,
        },
      });
    }

    processed += batch.length;
    spinner.text = `Embedding corpus chunks... ${processed}/${chunks.length}`;
  }

  spinner.stop();
  success(`Indexed ${processed} chunks into vector store`);

  return index;
}

// ── Query the index ────────────────────────────────────────────────────
export async function queryIndex(
  index: LocalIndex,
  query: string,
  topK: number = env.RETRIEVAL_TOP_K,
  domainFilter?: string,
): Promise<{ text: string; score: number; metadata: ChunkMetadata }[]> {
  // Embed the query
  const response = await getClient().embeddings.create({
    model: env.OPENAI_EMBEDDING_MODEL,
    input: query,
  });
  const firstEmbedding = response.data[0];
  if (!firstEmbedding) throw new Error("No embedding returned for query");
  const queryVector = firstEmbedding.embedding;

  // Search
  const results = await index.queryItems(queryVector, '', topK * 2);

  // Filter by domain if specified, then by threshold
  let filtered = results;
  if (domainFilter) {
    filtered = filtered.filter(
      (r) => (r.item.metadata as any).domain === domainFilter
    );
  }

  filtered = filtered.filter((r) => r.score >= env.RETRIEVAL_THRESHOLD);

  // Take top-K
  return filtered.slice(0, topK).map((r) => ({
    text: (r.item.metadata as any).text as string,
    score: r.score,
    metadata: {
      domain: (r.item.metadata as any).domain,
      title: (r.item.metadata as any).title,
      category: (r.item.metadata as any).category,
      filePath: (r.item.metadata as any).filePath,
      chunkIndex: (r.item.metadata as any).chunkIndex,
    } as ChunkMetadata,
  }));
}

// ── Delete index (for rebuild) ─────────────────────────────────────────
export async function deleteIndex(): Promise<void> {
  if (fs.existsSync(paths.vectorIndex)) {
    fs.rmSync(paths.vectorIndex, { recursive: true });
  }
}
