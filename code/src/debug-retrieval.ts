/**
 * Debug retrieval scores — show raw top results without threshold filter
 */
import { LocalIndex } from "vectra";
import OpenAI from "openai";
import { env, paths } from "./config.js";

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const index = new LocalIndex(paths.vectorIndex);

const queries = [
  { q: "delete account google login hackerrank community", domain: "hackerrank" },
  { q: "delete conversation private info claude", domain: "claude" },
  { q: "visa travellers cheques stolen what to do", domain: "visa" },
  { q: "report lost stolen visa card india", domain: "visa" },
];

for (const { q, domain } of queries) {
  const emb = await client.embeddings.create({ model: env.OPENAI_EMBEDDING_MODEL, input: q });
  const vec = emb.data[0]!.embedding;
  const results = await index.queryItems(vec, '', 5);
  const filtered = results.filter(r => (r.item.metadata as any).domain === domain);
  console.log("\nQuery:", q);
  console.log("Top results in domain [" + domain + "]:");
  for (const r of filtered.slice(0, 4)) {
    console.log("  score:", r.score.toFixed(4), "| title:", String((r.item.metadata as any).title).slice(0, 55));
  }
  console.log("Top overall (any domain):");
  for (const r of results.slice(0, 3)) {
    console.log("  score:", r.score.toFixed(4), "| domain:", (r.item.metadata as any).domain, "| title:", String((r.item.metadata as any).title).slice(0, 50));
  }
}
