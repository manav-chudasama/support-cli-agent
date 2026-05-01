/**
 * Smoke test — verify corpus loading and chunking without any API calls.
 */
import { loadCorpus, chunkArticles } from "./corpus-loader.js";
import { env, paths } from "./config.js";
import { readTickets } from "./csv-io.js";

console.log("✓ Config loaded");
console.log(`  OPENAI_MODEL: ${env.OPENAI_MODEL}`);
console.log(`  EMBEDDING_MODEL: ${env.OPENAI_EMBEDDING_MODEL}`);

const articles = loadCorpus();
console.log(`\n✓ Corpus loaded: ${articles.length} articles`);
const byDomain = articles.reduce((a, c) => { a[c.domain] = (a[c.domain] || 0) + 1; return a; }, {} as Record<string, number>);
for (const [d, n] of Object.entries(byDomain)) console.log(`  ${d}: ${n}`);

const chunks = chunkArticles(articles, 500, 50);
console.log(`\n✓ Chunks created: ${chunks.length}`);

const sampleTickets = readTickets(paths.sampleTickets);
console.log(`\n✓ Sample tickets loaded: ${sampleTickets.length}`);

const mainTickets = readTickets(paths.supportTickets);
console.log(`✓ Main tickets loaded: ${mainTickets.length}`);

console.log("\n✅ Smoke test passed — ready to run the pipeline");
