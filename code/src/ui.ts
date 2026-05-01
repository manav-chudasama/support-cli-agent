/**
 * Terminal UI module — provides rich visual feedback using chalk, ora, boxen, cli-table3, figures.
 */

import chalk from "chalk";
import ora, { type Ora } from "ora";
import boxen from "boxen";
import Table from "cli-table3";
import figures from "figures";

// ── Colors ─────────────────────────────────────────────────────────────
const c = {
  brand: chalk.hex("#6C63FF"),        // primary purple
  success: chalk.hex("#00E676"),       // green
  warn: chalk.hex("#FFD740"),          // amber
  error: chalk.hex("#FF5252"),         // red
  info: chalk.hex("#40C4FF"),          // cyan
  dim: chalk.dim,
  bold: chalk.bold,
  muted: chalk.gray,
};

export { c as colors };

// ── Banner ─────────────────────────────────────────────────────────────
export function showBanner(): void {
  const banner = boxen(
    `${c.brand.bold("⚡ Support Triage Agent")}\n` +
    `${c.dim("HackerRank Orchestrate • May 2026")}\n\n` +
    `${c.muted("Domains:")} ${c.info("HackerRank")} ${c.muted("•")} ${c.info("Claude")} ${c.muted("•")} ${c.info("Visa")}`,
    {
      padding: 1,
      margin: { top: 1, bottom: 1, left: 2, right: 2 },
      borderStyle: "round",
      borderColor: "#6C63FF",
      title: "v1.0",
      titleAlignment: "right",
    }
  );
  console.log(banner);
}

// ── Spinner Helpers ────────────────────────────────────────────────────
export function createSpinner(text: string): Ora {
  return ora({
    text,
    color: "cyan",
    spinner: "dots",
  });
}

// ── Phase Header ───────────────────────────────────────────────────────
export function phaseHeader(phase: number, title: string): void {
  console.log(
    `\n${c.brand("━".repeat(60))}\n` +
    `  ${c.brand.bold(`Phase ${phase}`)} ${c.bold(title)}\n` +
    `${c.brand("━".repeat(60))}`
  );
}

// ── Status Messages ────────────────────────────────────────────────────
export function success(msg: string): void {
  console.log(`  ${c.success(figures.tick)} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`  ${c.warn(figures.warning)} ${msg}`);
}

export function info(msg: string): void {
  console.log(`  ${c.info(figures.info)} ${msg}`);
}

export function error(msg: string): void {
  console.log(`  ${c.error(figures.cross)} ${msg}`);
}

// ── Ticket Progress ────────────────────────────────────────────────────
export function ticketProgress(
  index: number,
  total: number,
  company: string,
  status: string,
  requestType: string,
  issuePreview: string,
): void {
  const pct = Math.round(((index + 1) / total) * 100);
  const bar = renderProgressBar(pct, 20);
  const statusBadge = status === "escalated"
    ? c.warn(`[ESCALATED]`)
    : c.success(`[REPLIED]`);

  const typeBadge = requestType === "invalid"
    ? c.muted(`[${requestType}]`)
    : c.info(`[${requestType}]`);

  const companyBadge = formatCompany(company);

  console.log(
    `\n  ${c.dim(`${index + 1}/${total}`)} ${bar} ${c.dim(`${pct}%`)}\n` +
    `  ${companyBadge} ${statusBadge} ${typeBadge}\n` +
    `  ${c.dim("Issue:")} ${issuePreview}`
  );
}

function renderProgressBar(pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  return c.brand("█".repeat(filled)) + c.dim("░".repeat(empty));
}

function formatCompany(company: string): string {
  switch (company) {
    case "HackerRank": return chalk.bgHex("#1BA94C").black(" HR ");
    case "Claude": return chalk.bgHex("#D4A574").black(" CL ");
    case "Visa": return chalk.bgHex("#1A1F71").white(" VS ");
    default: return chalk.bgGray.white(" ?? ");
  }
}

// ── Summary Table ──────────────────────────────────────────────────────
export function showSummary(results: {
  total: number;
  replied: number;
  escalated: number;
  byType: Record<string, number>;
  byCompany: Record<string, number>;
  duration: number;
}): void {
  console.log(`\n${c.brand("━".repeat(60))}`);
  console.log(`  ${c.brand.bold("📊 Results Summary")}`);
  console.log(`${c.brand("━".repeat(60))}`);

  const overview = new Table({
    chars: { mid: "", "left-mid": "", "mid-mid": "", "right-mid": "" },
    style: { "padding-left": 2 },
  });
  overview.push(
    [c.dim("Total Tickets"), c.bold(String(results.total))],
    [c.success("Replied"), c.success(String(results.replied))],
    [c.warn("Escalated"), c.warn(String(results.escalated))],
    [c.dim("Duration"), c.dim(`${(results.duration / 1000).toFixed(1)}s`)],
  );
  console.log(overview.toString());

  const byType = new Table({
    head: [c.dim("Request Type"), c.dim("Count")],
    style: { "padding-left": 2 },
  });
  for (const [type, count] of Object.entries(results.byType)) {
    byType.push([type, String(count)]);
  }
  console.log(`\n  ${c.bold("By Request Type")}`);
  console.log(byType.toString());

  const byCompany = new Table({
    head: [c.dim("Company"), c.dim("Count")],
    style: { "padding-left": 2 },
  });
  for (const [company, count] of Object.entries(results.byCompany)) {
    byCompany.push([formatCompany(company) + " " + company, String(count)]);
  }
  console.log(`\n  ${c.bold("By Company")}`);
  console.log(byCompany.toString());

  console.log(`\n  ${c.success(figures.tick)} ${c.bold("Output written successfully")}\n`);
}
