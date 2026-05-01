/**
 * Decomposer — detects compound tickets and splits them into sub-requests.
 * One LLM call per ticket, only when compound heuristic triggers.
 */

import OpenAI from "openai";
import { env } from "./config.js";
import type { DecompositionResult, SubRequest } from "./schemas.js";

let openai: OpenAI;
function getClient(): OpenAI {
  if (!openai) openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return openai;
}

// ── Heuristic: is this ticket potentially compound? ─────────────────────
const COMPOUND_INDICATORS = [
  /\d+[\)\.]\s+/,                          // "1. issue" or "1) issue"
  /\n[-•*]\s+/,                            // bullet list
  /\b(additionally|also|furthermore|moreover|secondly|another issue|another question)\b/i,
  /\band\s+(also|additionally)\b/i,
  /\bfirst[\w\s]{0,20}second\b/i,
];

export function mightBeCompound(issue: string): boolean {
  if (issue.trim().split(/\s+/).length <= 15) return false; // too short to be compound
  return COMPOUND_INDICATORS.some((p) => p.test(issue));
}

const DECOMPOSE_SYSTEM_PROMPT = `You are analyzing a support ticket to determine if it contains multiple distinct requests.

A compound ticket has 2+ clearly SEPARATE issues that would be triaged differently (e.g., "My payment failed AND I want to delete my account" — two separate topics).

A single ticket that is just detailed or long is NOT compound (e.g., a bug report with lots of context is still one request).

Rules:
- If the ticket is compound, split it into 2-4 sub-requests. Each sub-request must be self-contained with enough context to understand it independently.
- If the ticket is NOT compound (just one request, even if detailed), return isCompound: false and put the full original text as the single item.
- Preserve key context in each sub-request (product name, account type, etc.)

Respond ONLY with this JSON:
{
  "isCompound": boolean,
  "subRequests": [
    { "text": "isolated request text", "focus": "one-line description" }
  ]
}`;

export async function decomposeTicket(
  issue: string,
  subject: string,
  company: string,
): Promise<DecompositionResult> {
  // Skip LLM call if heuristic says not compound
  if (!mightBeCompound(issue)) {
    return {
      isCompound: false,
      subRequests: [{ text: issue, focus: subject || issue.slice(0, 80) }],
    };
  }

  const input = [
    company !== "None" ? `Company: ${company}` : null,
    subject ? `Subject: ${subject}` : null,
    `Issue:\n${issue.slice(0, 1200)}`,
  ].filter(Boolean).join("\n");

  try {
    const response = await getClient().chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: DECOMPOSE_SYSTEM_PROMPT },
        { role: "user", content: input },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty decomposition response");

    const parsed = JSON.parse(content) as {
      isCompound: boolean;
      subRequests: Array<{ text: string; focus: string }>;
    };

    // Validate sub-requests
    const subRequests: SubRequest[] = (parsed.subRequests ?? [])
      .filter((s) => s && typeof s.text === "string" && s.text.trim().length > 0)
      .map((s) => ({ text: s.text.trim(), focus: s.focus?.trim() || s.text.slice(0, 80) }));

    if (subRequests.length === 0) {
      return {
        isCompound: false,
        subRequests: [{ text: issue, focus: subject || issue.slice(0, 80) }],
      };
    }

    return { isCompound: parsed.isCompound && subRequests.length > 1, subRequests };
  } catch {
    // Graceful fallback
    return {
      isCompound: false,
      subRequests: [{ text: issue, focus: subject || issue.slice(0, 80) }],
    };
  }
}

// ── Merge sub-request results into one output ───────────────────────────
const REQUEST_TYPE_SEVERITY: Record<string, number> = {
  product_issue: 4,
  bug: 3,
  feature_request: 2,
  invalid: 1,
};

export interface SubResult {
  response: string;
  justification: string;
  product_area: string;
  request_type: string;
  status: "replied" | "escalated";
  confidence: number;
}

export function mergeSubResults(subResults: SubResult[], isCompound: boolean): {
  response: string;
  justification: string;
  product_area: string;
  request_type: string;
  status: "replied" | "escalated";
} {
  if (subResults.length === 1) {
    return subResults[0]!;
  }

  // Status: escalated if ANY sub-request escalates
  const status: "replied" | "escalated" = subResults.some((r) => r.status === "escalated")
    ? "escalated"
    : "replied";

  // Request type: most severe
  const request_type = subResults.reduce((best, r) => {
    return (REQUEST_TYPE_SEVERITY[r.request_type] ?? 0) > (REQUEST_TYPE_SEVERITY[best] ?? 0)
      ? r.request_type
      : best;
  }, "invalid");

  // Product area: from most severe sub-request
  const dominant = subResults.reduce((best, r) => {
    return (REQUEST_TYPE_SEVERITY[r.request_type] ?? 0) >= (REQUEST_TYPE_SEVERITY[best.request_type] ?? 0)
      ? r
      : best;
  });
  const product_area = dominant.product_area;

  // Response: concatenate with separators
  const response = isCompound
    ? subResults.map((r, i) => `**[${i + 1}]** ${r.response}`).join("\n\n---\n\n")
    : subResults[0]!.response;

  // Justification: compound summary
  const justification = isCompound
    ? `[Compound ticket with ${subResults.length} sub-requests] ` +
      subResults.map((r, i) => `(${i + 1}) ${r.justification}`).join(" | ")
    : subResults[0]!.justification;

  return { response, justification, product_area, request_type, status };
}
