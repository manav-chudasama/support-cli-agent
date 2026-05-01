/**
 * Escalation gate — rule-based + classifier-informed + confidence-gated routing decision.
 *
 * DESIGN PRINCIPLE: Default to REPLIED when the corpus can answer.
 * Only escalate when the corpus genuinely cannot help OR the action
 * requires a human backend operation (refund, account restore, etc.)
 * OR confidence is very low.
 *
 * NOTE: Prompt injection/jailbreak detection has been moved to safety-guard.ts
 * which runs BEFORE this gate, so tickets reaching here are already clean.
 */

import type {
  Classification,
  NormalizedTicket,
  RetrievedChunk,
  ConfidenceScore,
} from "./schemas.js";

export interface EscalationDecision {
  shouldEscalate: boolean;
  reasons: string[];
}

// Actions that ALWAYS require a human — no corpus can substitute
const MUST_ESCALATE_PATTERNS: RegExp[] = [
  // Subscription billing actions (not just info)
  /\b(pause|cancel|suspend)\b.{0,15}\b(subscription|plan|billing|account)\b/i,
  // Explicit account access restoration (not just how-to)
  /\b(restore|reinstate|recover)\b.{0,15}\b(access|seat|workspace|license)\b/i,
  // Score / grade modification requests
  /\b(increase|change|modify|update)\b.{0,15}\b(score|grade|rating)\b/i,
  // Refund demands
  /\brefund\b.{0,20}\b(me|my|please|want|need|request)\b/i,
  // Rescheduling assessments (backend action)
  /\breschedul[ei]/i,
  // Remove/add user to org (user management backend actions)
  /\b(remove|add)\b.{0,15}\b(employee|interviewer|user|member|seat)\b.{0,20}\b(platform|org|team|account|workspace)\b/i,
];

// Outage / all-failing patterns — requires ops team
const OUTAGE_PATTERNS: RegExp[] = [
  /\bnone\b.{0,15}\b(of the|submissions|requests|pages)\b.{0,20}\b(working|accessible|loading|failing)\b/i,
  /\b(site|platform|service)\b.{0,10}\b(is )?down\b/i,
  /\ball\s+requests?\s+(are\s+)?fail(ing)?\b/i,
  /\bcompletely\s+(broken|down|fail(ed|ing))\b/i,
];

export function evaluateEscalation(
  ticket: NormalizedTicket,
  classification: Classification,
  retrievedChunks: RetrievedChunk[],
  confidence?: ConfidenceScore,
): EscalationDecision {
  const issueText = `${ticket.issue} ${ticket.subject}`;
  const reasons: string[] = [];

  // ── RULE 1: Critical risk always escalates ───────────────────────────
  if (classification.risk_level === "critical") {
    reasons.push(`Critical risk: ${classification.reasoning}`);
  }

  // ── RULE 2: Must-escalate backend actions ────────────────────────────
  for (const pattern of MUST_ESCALATE_PATTERNS) {
    if (pattern.test(issueText)) {
      reasons.push("Requires backend action by human support team");
      break;
    }
  }

  // ── RULE 3: System outage (ops issue) ────────────────────────────────
  if (OUTAGE_PATTERNS.some((p) => p.test(issueText))) {
    reasons.push("Possible system outage — requires operations team investigation");
  }

  // ── RULE 4: Zero retrieval + NOT invalid + NOT low risk ──────────────
  if (
    retrievedChunks.length === 0 &&
    classification.request_type !== "invalid" &&
    classification.risk_level !== "low"
  ) {
    reasons.push("No relevant corpus documentation found for this request");
  }

  // ── RULE 5: Vague with no company + insufficient context ─────────────
  if (
    ticket.company === "None" &&
    classification.request_type !== "invalid" &&
    ticket.issue.trim().split(/\s+/).length < 6
  ) {
    reasons.push("Vague request with no company context — insufficient to resolve");
  }

  // ── RULE 6: Trust the LLM classification for high risk + no corpus ───
  if (
    (classification.risk_level === "high" || classification.risk_level === "critical") &&
    !classification.can_answer_from_corpus &&
    reasons.length === 0
  ) {
    reasons.push(`High risk with insufficient corpus coverage: ${classification.reasoning}`);
  }

  // ── RULE 7: Confidence gate — very low confidence on real tickets ─────
  if (
    confidence &&
    confidence.level === "very_low" &&
    classification.request_type !== "invalid"
  ) {
    reasons.push(
      `Very low confidence (score: ${confidence.score.toFixed(2)}) — corpus coverage insufficient for reliable answer`
    );
  }

  return { shouldEscalate: reasons.length > 0, reasons };
}
