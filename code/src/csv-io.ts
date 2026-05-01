/**
 * CSV I/O — reads support tickets and writes output.csv with proper quoting.
 */

import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { readFileSync, writeFileSync } from "fs";
import { TicketInputSchema, OutputRowSchema, type TicketInput, type OutputRow, type NormalizedTicket } from "./schemas.js";

// ── Read tickets from CSV ──────────────────────────────────────────────
export function readTickets(csvPath: string): NormalizedTicket[] {
  const raw = readFileSync(csvPath, "utf-8");
  const records: Record<string, string>[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });

  return records.map((row, index) => {
    // Normalize column names (CSV has capitalized headers)
    const normalized = {
      Issue: row["Issue"] ?? row["issue"] ?? "",
      Subject: row["Subject"] ?? row["subject"] ?? "",
      Company: (row["Company"] ?? row["company"] ?? "None").trim(),
    };

    const parsed = TicketInputSchema.parse(normalized);

    // Normalize company
    let company: "HackerRank" | "Claude" | "Visa" | "None" = "None";
    const c = parsed.Company.toLowerCase().trim();
    if (c.includes("hackerrank")) company = "HackerRank";
    else if (c.includes("claude")) company = "Claude";
    else if (c.includes("visa")) company = "Visa";
    else if (c === "none" || c === "") company = "None";

    return {
      issue: parsed.Issue.trim(),
      subject: parsed.Subject.trim(),
      company,
      index,
    };
  });
}

// ── Write output CSV ───────────────────────────────────────────────────
export function writeOutput(outputPath: string, rows: OutputRow[]): void {
  // Validate every row before writing
  const validated = rows.map((row, i) => {
    const result = OutputRowSchema.safeParse(row);
    if (!result.success) {
      throw new Error(`Output row ${i} failed validation: ${JSON.stringify(result.error.issues)}`);
    }
    return result.data;
  });

  const csv = stringify(validated, {
    header: true,
    columns: [
      "issue",
      "subject",
      "company",
      "response",
      "product_area",
      "status",
      "request_type",
      "justification",
    ],
    quoted: true,
  });

  writeFileSync(outputPath, csv, "utf-8");
}
