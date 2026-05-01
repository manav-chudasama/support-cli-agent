/**
 * Main CLI entry point — orchestrates the full Phase 2 triage pipeline.
 *
 * Pipeline per ticket:
 *   normalize → [F1] safety guard → [F2] decompose → per sub-request:
 *     [F3] expand query → [F4] multi-query retrieve → classify →
 *     [F5] confidence score → escalation → respond → [F6] log
 *
 * Usage: bun run src/main.ts [--rebuild] [--sample]
 */

import { paths, env } from "./config.js";
import { readTickets, writeOutput } from "./csv-io.js";
import { loadCorpus, chunkArticles } from "./corpus-loader.js";
import { buildIndex, deleteIndex } from "./indexer.js";
import { retrieve } from "./retriever.js";
import { classifyTicket } from "./classifier.js";
import { evaluateEscalation } from "./escalation.js";
import { generateResponse } from "./responder.js";
import { checkSafety, buildSafetyResponse } from "./safety-guard.js";
import { decomposeTicket } from "./decomposer.js";
import { mergeSubResults } from "./decomposer.js";
import type { SubResult } from "./decomposer.js";
import { expandQuery } from "./query-expander.js";
import { computeConfidence } from "./confidence.js";
import { writeTicketLog, writeSummaryLog, buildTicketLog } from "./logger.js";
import type { OutputRow, SubRequestLog, SummaryLog } from "./schemas.js";
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
  const runStart = Date.now();

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
  info("Pipeline: safety → decompose → expand → retrieve → classify → confidence → escalate → respond\n");

  const results: OutputRow[] = [];
  const stats = {
    replied: 0,
    escalated: 0,
    safetyFlagged: 0,
    compound: 0,
    byType: {} as Record<string, number>,
    byCompany: {} as Record<string, number>,
    byConfidenceLevel: {} as Record<string, number>,
    confidenceSum: 0,
    confidenceCount: 0,
  };

  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i]!;
    const ticketStart = Date.now();
    const timing = {
      totalMs: 0,
      safetyMs: 0,
      decompositionMs: 0,
      expansionMs: 0,
      retrievalMs: 0,
      classificationMs: 0,
      confidenceMs: 0,
      responseMs: 0,
    };

    const ticketSpinner = createSpinner(
      `[${i + 1}/${tickets.length}] Safety check...`
    );
    ticketSpinner.start();

    try {
      // ── F1: Safety Guard ──────────────────────────────────────────
      const t1 = Date.now();
      const safety = checkSafety(ticket.issue, ticket.subject);
      timing.safetyMs = Date.now() - t1;

      if (!safety.safe) {
        stats.safetyFlagged++;
        const { response, justification } = buildSafetyResponse(safety);
        const outputRow: OutputRow = {
          issue: ticket.issue,
          subject: ticket.subject,
          company: ticket.company,
          response,
          product_area: "general_support",
          status: "replied",
          request_type: "invalid",
          justification,
        };
        results.push(outputRow);
        stats.replied++;
        stats.byCompany[ticket.company] = (stats.byCompany[ticket.company] || 0) + 1;
        stats.byType["invalid"] = (stats.byType["invalid"] || 0) + 1;
        timing.totalMs = Date.now() - ticketStart;

        ticketSpinner.stop();
        ticketProgress(i, tickets.length, ticket.company, "replied", "invalid",
          `[SAFETY:${safety.flagType}] ${ticket.issue.slice(0, 50)}`);

        writeTicketLog(buildTicketLog({
          ticket,
          safety,
          decomposition: { isCompound: false, subRequests: [{ text: ticket.issue, focus: "safety-flagged" }] },
          subRequestLogs: [],
          output: outputRow,
          timing,
        }));
        continue;
      }

      // ── F2: Decompose ─────────────────────────────────────────────
      ticketSpinner.text = `[${i + 1}/${tickets.length}] Decomposing request...`;
      const t2 = Date.now();
      const decomposition = await decomposeTicket(ticket.issue, ticket.subject, ticket.company);
      timing.decompositionMs = Date.now() - t2;
      if (decomposition.isCompound) stats.compound++;

      // ── Process each sub-request ──────────────────────────────────
      const subResults: SubResult[] = [];
      const subRequestLogs: SubRequestLog[] = [];

      for (const subReq of decomposition.subRequests) {
        // F3: Query Expansion
        ticketSpinner.text = `[${i + 1}/${tickets.length}] Expanding query...`;
        const t3 = Date.now();
        const expanded = await expandQuery(subReq.text, ticket.subject, ticket.company);
        timing.expansionMs += Date.now() - t3;

        // F4: Multi-query Retrieval
        ticketSpinner.text = `[${i + 1}/${tickets.length}] Retrieving context...`;
        const t4 = Date.now();
        const retrievedChunks = await retrieve(index, { ...ticket, issue: subReq.text }, expanded.queries);
        timing.retrievalMs += Date.now() - t4;

        // Classify
        ticketSpinner.text = `[${i + 1}/${tickets.length}] Classifying...`;
        const t5 = Date.now();
        const classification = await classifyTicket({ ...ticket, issue: subReq.text }, retrievedChunks);
        timing.classificationMs += Date.now() - t5;

        // F5: Confidence Score
        const t6 = Date.now();
        const confidence = computeConfidence(retrievedChunks, classification);
        timing.confidenceMs += Date.now() - t6;
        stats.confidenceSum += confidence.score;
        stats.confidenceCount++;
        stats.byConfidenceLevel[confidence.level] = (stats.byConfidenceLevel[confidence.level] || 0) + 1;

        // Escalation Gate
        ticketSpinner.text = `[${i + 1}/${tickets.length}] Evaluating escalation...`;
        const escalation = evaluateEscalation(ticket, classification, retrievedChunks, confidence);

        // Generate Response
        ticketSpinner.text = `[${i + 1}/${tickets.length}] Generating response...`;
        const t7 = Date.now();
        const { response, justification } = await generateResponse(
          { ...ticket, issue: subReq.text },
          classification,
          retrievedChunks,
          escalation,
          confidence,
        );
        timing.responseMs += Date.now() - t7;

        const status: "replied" | "escalated" = escalation.shouldEscalate ? "escalated" : "replied";

        subResults.push({
          response,
          justification,
          product_area: classification.product_area,
          request_type: classification.request_type,
          status,
          confidence: confidence.score,
        });

        subRequestLogs.push({
          focus: subReq.focus,
          text: subReq.text,
          expandedQueries: expanded.queries,
          detectedLanguage: expanded.detectedLanguage,
          retrievedChunks: retrievedChunks.slice(0, 5).map((chunk) => ({
            title: chunk.metadata.title,
            domain: chunk.metadata.domain,
            filePath: chunk.metadata.filePath,
            score: chunk.score,
            snippet: chunk.text.slice(0, 120),
          })),
          classification,
          confidence,
          escalation,
          response,
          justification,
        });
      }

      // Merge sub-results
      const merged = mergeSubResults(subResults, decomposition.isCompound);

      const outputRow: OutputRow = {
        issue: ticket.issue,
        subject: ticket.subject,
        company: ticket.company,
        response: merged.response,
        product_area: merged.product_area,
        status: merged.status,
        request_type: merged.request_type as OutputRow["request_type"],
        justification: merged.justification,
      };

      results.push(outputRow);

      // Update stats
      if (merged.status === "escalated") stats.escalated++;
      else stats.replied++;
      stats.byType[merged.request_type] = (stats.byType[merged.request_type] || 0) + 1;
      stats.byCompany[ticket.company] = (stats.byCompany[ticket.company] || 0) + 1;

      timing.totalMs = Date.now() - ticketStart;
      ticketSpinner.stop();

      const preview = ticket.issue.slice(0, 60).replace(/\n/g, " ") +
        (ticket.issue.length > 60 ? "..." : "");
      const compoundTag = decomposition.isCompound ? " [compound]" : "";
      ticketProgress(i, tickets.length, ticket.company, merged.status, merged.request_type, preview + compoundTag);

      writeTicketLog(buildTicketLog({ ticket, safety, decomposition, subRequestLogs, output: outputRow, timing }));

    } catch (err: any) {
      ticketSpinner.fail(`Ticket ${i + 1} failed: ${err.message}`);
      error(`  ${err.stack?.split("\n")[0] || err.message}`);

      const outputRow: OutputRow = {
        issue: ticket.issue,
        subject: ticket.subject,
        company: ticket.company,
        response: "This ticket has been escalated to a human support specialist for review.",
        product_area: "unknown",
        status: "escalated",
        request_type: "product_issue",
        justification: `Processing error: ${err.message}. Escalated as safety fallback.`,
      };
      results.push(outputRow);
      stats.escalated++;
      stats.byCompany[ticket.company] = (stats.byCompany[ticket.company] || 0) + 1;
      stats.byType["product_issue"] = (stats.byType["product_issue"] || 0) + 1;
    }
  }

  // ── Phase 5: Write Output ──────────────────────────────────────────
  phaseHeader(5, "Writing Output");

  const outputSpinner = createSpinner("Validating and writing output.csv...");
  outputSpinner.start();
  writeOutput(paths.outputCsv, results);
  outputSpinner.succeed(`Output written to ${c.dim(paths.outputCsv)}`);

  // ── F6: Write summary log ──────────────────────────────────────────
  const avgConfidence = stats.confidenceCount > 0
    ? Math.round((stats.confidenceSum / stats.confidenceCount) * 1000) / 1000
    : 0;

  const summaryLog: SummaryLog = {
    runTimestamp: new Date().toISOString(),
    totalTickets: tickets.length,
    replied: stats.replied,
    escalated: stats.escalated,
    compoundTickets: stats.compound,
    safetyFlagged: stats.safetyFlagged,
    avgConfidenceScore: avgConfidence,
    durationMs: Date.now() - runStart,
    byCompany: stats.byCompany,
    byRequestType: stats.byType,
    byConfidenceLevel: stats.byConfidenceLevel,
  };
  writeSummaryLog(summaryLog);

  if (env.ENABLE_LOGGING) {
    info(`Logs written to ${c.dim(paths.logsDir)}`);
  }

  // ── Summary ────────────────────────────────────────────────────────
  showSummary({
    total: tickets.length,
    replied: stats.replied,
    escalated: stats.escalated,
    byType: stats.byType,
    byCompany: stats.byCompany,
    duration: Date.now() - runStart,
  });

  if (stats.compound > 0) {
    info(`  Compound tickets decomposed: ${stats.compound}`);
  }
  if (stats.safetyFlagged > 0) {
    info(`  Safety-flagged (pre-LLM): ${stats.safetyFlagged}`);
  }
  info(`  Avg confidence score: ${avgConfidence.toFixed(3)}`);
}

main().catch((err) => {
  error(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
