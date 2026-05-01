/**
 * Debug: show classification + escalation reasoning for missed tickets
 */
import { loadCorpus, chunkArticles } from "./corpus-loader.js";
import { buildIndex } from "./indexer.js";
import { retrieve, formatContext } from "./retriever.js";
import { classifyTicket } from "./classifier.js";
import { evaluateEscalation } from "./escalation.js";
import type { NormalizedTicket } from "./schemas.js";

const tickets: NormalizedTicket[] = [
  { index: 0, issue: "i signed up using google login on hackerrank community , so i do not have a separate hackerrank password. please delete my account", subject: "", company: "HackerRank" },
  { index: 1, issue: "One of my claude conversations has some private info, i forgot to make a temporary chat, is there anything else that can be done? like delete etc?", subject: "", company: "Claude" },
  { index: 2, issue: "I bought Visa Traveller's Cheques from Citicorp and they were stolen in Lisbon last night. What do I do?", subject: "", company: "Visa" },
  { index: 3, issue: "Where can I report a lost or stolen Visa card from India?", subject: "Card stolen", company: "Visa" },
];

const articles = loadCorpus();
const chunks = chunkArticles(articles);
const index = await buildIndex(chunks);

for (const ticket of tickets) {
  console.log("\n" + "=".repeat(70));
  console.log("TICKET:", ticket.issue.slice(0, 80));
  const retrieved = await retrieve(index, ticket);
  console.log("RETRIEVED:", retrieved.length, "chunks, top scores:", retrieved.slice(0,3).map(r => r.score.toFixed(3) + " [" + r.metadata.title.slice(0,40) + "]").join(", "));
  const classification = await classifyTicket(ticket, retrieved);
  console.log("CLASSIFICATION:", JSON.stringify({ risk_level: classification.risk_level, can_answer: classification.can_answer_from_corpus, reasons: classification.escalation_reasons }, null, 2));
  const escalation = evaluateEscalation(ticket, classification, retrieved);
  console.log("ESCALATION:", escalation.shouldEscalate ? "YES" : "NO", escalation.reasons);
}
