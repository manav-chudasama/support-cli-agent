/**
 * Structured JSON logger — writes one file per ticket to logs/ directory.
 * Invaluable for judge interview: shows full pipeline trace for every decision.
 */

import fs from "fs";
import path from "path";
import { env, paths } from "./config.js";
import type {
  SafetyResult,
  DecompositionResult,
  ConfidenceScore,
  SubRequestLog,
  TicketLog,
  SummaryLog,
  OutputRow,
  NormalizedTicket,
} from "./schemas.js";

// Ensure logs directory exists
function ensureLogsDir(): void {
  if (!fs.existsSync(paths.logsDir)) {
    fs.mkdirSync(paths.logsDir, { recursive: true });
  }
}

export function writeTicketLog(log: TicketLog): void {
  if (!env.ENABLE_LOGGING) return;
  ensureLogsDir();
  const fileName = `ticket-${String(log.ticketIndex).padStart(3, "0")}.json`;
  const filePath = path.join(paths.logsDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(log, null, 2), "utf-8");
}

export function writeSummaryLog(summary: SummaryLog): void {
  if (!env.ENABLE_LOGGING) return;
  ensureLogsDir();
  const filePath = path.join(paths.logsDir, "summary.json");
  fs.writeFileSync(filePath, JSON.stringify(summary, null, 2), "utf-8");
}

export function buildTicketLog(params: {
  ticket: NormalizedTicket;
  safety: SafetyResult;
  decomposition: DecompositionResult;
  subRequestLogs: SubRequestLog[];
  output: OutputRow;
  timing: TicketLog["timing"];
}): TicketLog {
  return {
    ticketIndex: params.ticket.index,
    timestamp: new Date().toISOString(),
    input: {
      issue: params.ticket.issue,
      subject: params.ticket.subject,
      company: params.ticket.company,
    },
    safety: params.safety,
    decomposition: params.decomposition,
    subRequests: params.subRequestLogs,
    output: params.output,
    timing: params.timing,
  };
}
