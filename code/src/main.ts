/**
 * Main CLI entry point — orchestrates the full triage pipeline.
 * Usage: bun run src/main.ts [--rebuild] [--sample]
 */

import { paths } from "./config.js";
import { readTickets, writeOutput } from "./csv-io.js";
import { loadCorpus, chunkArticles } from "./corpus-loader.js";
import { buildIndex, deleteIndex } from "./indexer.js";
import { retrieve } from "./retriever.js";
import { classifyTicket } from "./classifier.js";
import { evaluateEscalation } from "./escalation.js";
import { generateResponse } from "./responder.js";
import type { OutputRow } from "./schemas.js";
import {
  showBanner,
  phaseHeader,
  createSpinner,
  success,
  warn,
  info,
  error,
  ticketProgress,
  showSummary,
  colors as c,
} from "./ui.js";

// ── Parse CLI args ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
const REBUILD = args.includes("--rebuild");
const USE_SAMPLE = args.includes("--sample");

async function main() {
  const startTime = Date.now();

  showBanner();

  // ── Phase 1: Load Corpus ───────────────────────────────────────────
  phaseHeader(1, "Loading Corpus");

  if (REBUILD) {
    warn("Rebuilding index from scratch (--rebuild flag)");
    await deleteIndex();
  }

  const corpusSpinner = createSpinner("Walking corpus directories...");
  corpusSpinner.start();

  const articles = loadCorpus();
  corpusSpinner.succeed(
    `Loaded ${c.bold(String(articles.length))} articles from corpus`
  );

  const domainCounts = articles.reduce((acc, a) => {
    acc[a.domain] = (acc[a.domain] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  for (const [domain, count] of Object.entries(domainCounts)) {
    info(`  ${domain}: ${count} articles`);
  }

  // ── Phase 2: Index Corpus ──────────────────────────────────────────
  phaseHeader(2, "Building Vector Index");

  const chunkSpinner = createSpinner("Chunking articles...");
  chunkSpinner.start();

  const chunks = chunkArticles(articles);
  chunkSpinner.succeed(`Created ${c.bold(String(chunks.length))} chunks`);

  const index = await buildIndex(chunks);

  // ── Phase 3: Read Tickets ──────────────────────────────────────────
  phaseHeader(3, "Reading Support Tickets");

  const csvPath = USE_SAMPLE ? paths.sampleTickets : paths.supportTickets;
  const tickets = readTickets(csvPath);
  success(`Loaded ${c.bold(String(tickets.length))} tickets from ${USE_SAMPLE ? "sample" : "main"} CSV`);

  // ── Phase 4: Process Tickets ───────────────────────────────────────
  phaseHeader(4, "Processing Tickets");
  info("Running: retrieve → classify → escalation check → respond\n");

  const results: OutputRow[] = [];
  const stats = {
    replied: 0,
    escalated: 0,
    byType: {} as Record<string, number>,
    byCompany: {} as Record<string, number>,
  };

  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i]!;
    const ticketSpinner = createSpinner(
      `[${i + 1}/${tickets.length}] Retrieving context...`
    );
    ticketSpinner.start();

    try {
      // Step 1: Retrieve
      ticketSpinner.text = `[${i + 1}/${tickets.length}] Retrieving context...`;
      const retrievedChunks = await retrieve(index, ticket);

      // Step 2: Classify
      ticketSpinner.text = `[${i + 1}/${tickets.length}] Classifying...`;
      const classification = await classifyTicket(ticket, retrievedChunks);

      // Step 3: Escalation check
      ticketSpinner.text = `[${i + 1}/${tickets.length}] Evaluating escalation...`;
      const escalation = evaluateEscalation(ticket, classification, retrievedChunks);

      // Step 4: Generate response
      ticketSpinner.text = `[${i + 1}/${tickets.length}] Generating response...`;
      const { response, justification } = await generateResponse(
        ticket,
        classification,
        retrievedChunks,
        escalation,
      );

      const status = escalation.shouldEscalate ? "escalated" : "replied";

      const outputRow: OutputRow = {
        issue: ticket.issue,
        subject: ticket.subject,
        company: ticket.company,
        response,
        product_area: classification.product_area,
        status,
        request_type: classification.request_type,
        justification,
      };

      results.push(outputRow);

      // Update stats
      if (status === "escalated") stats.escalated++;
      else stats.replied++;
      stats.byType[classification.request_type] =
        (stats.byType[classification.request_type] || 0) + 1;
      stats.byCompany[ticket.company] =
        (stats.byCompany[ticket.company] || 0) + 1;

      ticketSpinner.stop();

      // Display progress
      const preview = ticket.issue.slice(0, 60).replace(/\n/g, " ") +
        (ticket.issue.length > 60 ? "..." : "");
      ticketProgress(
        i,
        tickets.length,
        ticket.company,
        status,
        classification.request_type,
        preview,
      );
    } catch (err: any) {
      ticketSpinner.fail(`Ticket ${i + 1} failed: ${err.message}`);
      error(`  ${err.stack?.split("\n")[0] || err.message}`);

      // Write a fallback escalation row
      results.push({
        issue: ticket.issue,
        subject: ticket.subject,
        company: ticket.company,
        response: "This ticket has been escalated to a human support specialist for review.",
        product_area: "unknown",
        status: "escalated",
        request_type: "product_issue",
        justification: `Processing error: ${err.message}. Escalated as safety fallback.`,
      });
      stats.escalated++;
      stats.byCompany[ticket.company] =
        (stats.byCompany[ticket.company] || 0) + 1;
      stats.byType["product_issue"] = (stats.byType["product_issue"] || 0) + 1;
    }
  }

  // ── Phase 5: Write Output ──────────────────────────────────────────
  phaseHeader(5, "Writing Output");

  const outputSpinner = createSpinner("Validating and writing output.csv...");
  outputSpinner.start();

  writeOutput(paths.outputCsv, results);

  outputSpinner.succeed(`Output written to ${c.dim(paths.outputCsv)}`);

  // ── Summary ────────────────────────────────────────────────────────
  showSummary({
    total: tickets.length,
    replied: stats.replied,
    escalated: stats.escalated,
    byType: stats.byType,
    byCompany: stats.byCompany,
    duration: Date.now() - startTime,
  });
}

main().catch((err) => {
  error(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
