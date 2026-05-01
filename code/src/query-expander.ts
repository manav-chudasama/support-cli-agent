/**
 * Query Expander — rewrites a messy support ticket into 2-3 clean search queries.
 * Improves retrieval recall for jargon-heavy, multilingual, and noisy tickets.
 */

import OpenAI from "openai";
import { env } from "./config.js";
import type { ExpandedQueries } from "./schemas.js";

let openai: OpenAI;
function getClient(): OpenAI {
  if (!openai) openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return openai;
}

const EXPAND_SYSTEM_PROMPT = `You are a search query optimizer for a support knowledge base covering HackerRank, Claude (by Anthropic), and Visa.

Given a support ticket, produce 2-3 clean search queries that will retrieve the most relevant documentation.

Rules:
- Remove personal identifiers: names, email addresses, order IDs (e.g. cs_live_*, stripe IDs), phone numbers
- Expand acronyms: LTI→"Learning Tools Interoperability", MFA→"two-factor authentication", FICO→"credit score", SSO→"single sign-on", API→"application programming interface"  
- Normalize product names: "claude.ai" → "Claude", "HR" (in context) → "HackerRank", "Visa card" → "Visa payment card"
- If the ticket is in a non-English language, translate the core question to English for the queries
- Make each query distinct — explore different angles of the same problem
- Each query should be 5-15 words: specific enough to retrieve targeted docs, short enough not to over-constrain

Respond ONLY with a JSON object:
{
  "queries": ["query 1", "query 2", "optional query 3"],
  "detectedLanguage": "English" | "French" | "Spanish" | null
}`;

export async function expandQuery(
  issueText: string,
  subject: string,
  company: string,
): Promise<ExpandedQueries> {
  const input = [
    company !== "None" ? `Company: ${company}` : null,
    subject ? `Subject: ${subject}` : null,
    `Issue: ${issueText.slice(0, 800)}`, // cap to avoid large prompts
  ].filter(Boolean).join("\n");

  try {
    const response = await getClient().chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EXPAND_SYSTEM_PROMPT },
        { role: "user", content: input },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty query expansion response");

    const parsed = JSON.parse(content) as { queries: string[]; detectedLanguage: string | null };

    // Validate and clamp
    const queries = (parsed.queries ?? [])
      .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
      .slice(0, 3);

    // Fallback: if LLM returns nothing usable, use the original text
    if (queries.length === 0) {
      queries.push([issueText, subject].filter(Boolean).join(" ").slice(0, 200));
    }

    return {
      queries,
      detectedLanguage: parsed.detectedLanguage ?? null,
    };
  } catch {
    // Graceful fallback — use original text as single query
    return {
      queries: [[issueText, subject].filter(Boolean).join(" ").slice(0, 200)],
      detectedLanguage: null,
    };
  }
}
