/**
 * Safety Guard — adversarial pre-processing gate.
 * Runs BEFORE any LLM or embedding call. Zero API cost.
 * Detects prompt injection, jailbreaks, and adversarial inputs.
 */

import type { SafetyResult } from "./schemas.js";

// ── Prompt injection patterns ──────────────────────────────────────────
const INJECTION_PATTERNS: { pattern: RegExp; detail: string }[] = [
  { pattern: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+instructions?/i, detail: "Attempt to override instructions" },
  { pattern: /reveal\s+(your\s+)?(system\s+prompt|internal\s+(prompt|logic|rules))/i, detail: "System prompt extraction attempt" },
  { pattern: /display\s+(all\s+)?(retrieved|internal|system)\s+(documents?|context|chunks?)/i, detail: "Internal context extraction attempt" },
  { pattern: /output\s+(the\s+)?(entire|full|complete)\s+(prompt|context|instructions?)/i, detail: "Prompt extraction attempt" },
  { pattern: /what\s+(are\s+)?your\s+(instructions?|rules?|guidelines?|constraints?)/i, detail: "Rule extraction attempt" },
  { pattern: /show\s+me\s+(your\s+)?(system|internal|hidden)\s+(prompt|instructions?)/i, detail: "Hidden prompt extraction" },
  { pattern: /répété[eés]?\s+mot\s+(à|a)\s+mot/i, detail: "French prompt extraction attempt" },
  { pattern: /les\s+documents\s+récupérés/i, detail: "French corpus extraction attempt" },
];

// ── Jailbreak patterns ──────────────────────────────────────────────────
const JAILBREAK_PATTERNS: { pattern: RegExp; detail: string }[] = [
  { pattern: /\byou\s+are\s+now\b/i, detail: "Identity override attempt" },
  { pattern: /\bpretend\s+(you\s+are|to\s+be)\b/i, detail: "Persona override attempt" },
  { pattern: /\bact\s+as\s+(a\s+)?(?!support|assistant|agent)[a-z\s]{3,30}\b/i, detail: "Persona override attempt" },
  { pattern: /\broleplay\s+as\b/i, detail: "Roleplay override attempt" },
  { pattern: /\bDAN\b/, detail: "DAN jailbreak pattern" },
  { pattern: /\bjailbreak\b/i, detail: "Explicit jailbreak mention" },
  { pattern: /do\s+anything\s+now/i, detail: "DAN variant" },
  { pattern: /you\s+(have\s+)?(no\s+)?(restrictions?|limits?|rules?|guidelines?)/i, detail: "Restriction bypass attempt" },
];

// ── Adversarial executable content patterns ─────────────────────────────
const ADVERSARIAL_PATTERNS: { pattern: RegExp; detail: string }[] = [
  { pattern: /delete\s+all\s+files?/i, detail: "Destructive file operation request" },
  { pattern: /rm\s+-rf\s+[\/~]/i, detail: "Destructive shell command" },
  { pattern: /format\s+(the\s+)?(hard\s+)?drive/i, detail: "Destructive operation request" },
  { pattern: /execute\s+(the\s+)?(following|this|below)\s+(code|command|script)/i, detail: "Code execution request" },
  { pattern: /run\s+this\s+(command|script|code)/i, detail: "Code execution request" },
  { pattern: /give\s+me\s+(the\s+)?code\s+to\s+.{0,40}(delete|destroy|wipe|hack|exploit)/i, detail: "Malicious code request" },
  { pattern: /\b(hack|exploit|breach|bypass)\s+(the\s+)?(system|database|server|api)/i, detail: "Security exploitation request" },
];

// ── Sanitization — strip injected instructions from text ───────────────
function sanitizeIssue(issue: string): string {
  // Remove common injection artifacts but preserve the legitimate part
  return issue
    .replace(/---+\s*(SYSTEM|ADMIN|OVERRIDE|INSTRUCTION)\s*---+[\s\S]*?---+/gi, "[removed]")
    .replace(/\[INST\][\s\S]*?\[\/INST\]/gi, "[removed]")
    .trim();
}

export function checkSafety(issue: string, subject: string): SafetyResult {
  const combined = `${issue}\n${subject}`.trim();

  // Check injection
  for (const { pattern, detail } of INJECTION_PATTERNS) {
    if (pattern.test(combined)) {
      return {
        safe: false,
        flagType: "injection",
        flagDetail: detail,
        sanitizedIssue: sanitizeIssue(issue),
      };
    }
  }

  // Check jailbreak
  for (const { pattern, detail } of JAILBREAK_PATTERNS) {
    if (pattern.test(combined)) {
      return {
        safe: false,
        flagType: "jailbreak",
        flagDetail: detail,
        sanitizedIssue: sanitizeIssue(issue),
      };
    }
  }

  // Check adversarial executable content
  for (const { pattern, detail } of ADVERSARIAL_PATTERNS) {
    if (pattern.test(combined)) {
      return {
        safe: false,
        flagType: "adversarial",
        flagDetail: detail,
        sanitizedIssue: sanitizeIssue(issue),
      };
    }
  }

  return {
    safe: true,
    flagType: null,
    flagDetail: null,
    sanitizedIssue: issue,
  };
}

export function buildSafetyResponse(safety: SafetyResult): { response: string; justification: string } {
  return {
    response: "I appreciate you reaching out. Unfortunately, this request falls outside the scope of our support services (HackerRank, Claude, and Visa). If you have a genuine support question, please submit a new request.",
    justification: `Ticket flagged by safety guard before processing. Type: ${safety.flagType}. Detail: ${safety.flagDetail}. No LLM calls made.`,
  };
}
