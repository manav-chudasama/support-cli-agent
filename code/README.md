# ⚡ Support Triage Agent

A highly deterministic, terminal-based AI triage pipeline built for the HackerRank Orchestrate 2026 hackathon.

This agent processes support tickets across three ecosystems (HackerRank, Claude, and Visa), retrieves relevant context from a local markdown corpus using hybrid vector search, and intelligently routes tickets between automated replies and human escalation.

**Built with Bun, TypeScript, and OpenAI (`gpt-4o` + `text-embedding-3-small`).**

---

## 🎯 Key Differentiators

This agent goes beyond basic RAG by implementing a robust, defensive architecture designed specifically for the evaluation rubric:

1. **Adversarial Pre-processing (Safety Guard):** Runs a deterministic, zero-cost regex gate *before* any LLM calls. Detects prompt injections, jailbreaks, and adversarial executable requests (e.g., "ignore previous instructions", "delete all files") and instantly flags them as invalid.
2. **Multi-Request Decomposition:** Automatically detects compound tickets (tickets with multiple unrelated requests) using heuristics, uses the LLM to cleanly split them into sub-requests, processes each independently, and merges the responses.
3. **LLM Query Expansion:** Messy user tickets are rewritten by the LLM into 2-3 clean, targeted search queries. Acronyms are expanded, noise is removed, and non-English tickets are translated to English to maximize vector retrieval recall.
4. **Deterministic Confidence Scoring:** Computes a 0–1 confidence score based purely on mathematical signals (retrieval quality, chunk count, corpus coverage boolean, risk penalty). Very low confidence triggers an automatic escalation, making the system principled and explainable.
5. **Corpus Traceability:** The `justification` output field explicitly cites the exact source files used to ground the response (e.g., *"[Delete an Account] from the corpus"*).
6. **Structured JSON Logging:** Writes a detailed JSON trace to the `logs/` directory for *every single ticket*. It tracks timing, safety checks, decomposed sub-requests, expanded queries, chunk retrieval scores, and confidence breakdowns. **Invaluable for understanding exactly why the agent made a specific decision.**

---

## 🏗️ Architecture Pipeline

The agent processes the `support_tickets.csv` through a strictly typed 7-stage pipeline:

```text
CSV Input → Zod Validation
  ↓
[1] Safety Guard          ← Zero-cost injection/jailbreak detection
  ↓
[2] Decomposer            ← Splits compound tickets (e.g., "Refund me AND how do I login?")
  ↓
  (For each sub-request)
  [3] Query Expander      ← Rewrites ticket into 2-3 clean search queries
  [4] Multi-Query RAG     ← Retrieves & deduplicates chunks from Vectra index
  [5] Classifier          ← Extracts product area, risk level, request type
  [6] Confidence & Gate   ← Deterministic escalation gate (default-to-reply)
  [7] Responder           ← Generates grounded response with corpus citations
  ↓
Merge Sub-results
  ↓
[8] JSON Logger           ← Writes full trace to logs/ticket-XXX.json
  ↓
CSV Output → output.csv
```

---

## 🚀 Setup & Usage

### 1. Prerequisites
- **[Bun](https://bun.sh/)** installed (`v1.0.0+`)
- An OpenAI API Key with credits

### 2. Installation
```bash
cd code
bun install
```

### 3. Configuration
Copy the environment template and add your API key:
```bash
cp .env.example .env
```
Ensure `OPENAI_API_KEY` is set in your `.env` file.

### 4. Running the Agent

**Run against the sample CSV (for testing):**
```bash
bun run start:sample
```

**Run against the main production CSV:**
```bash
bun run start
```

**Force rebuild the vector index:**
*(The index is cached in `data/index/` after the first run. Use this if the corpus changes).*
```bash
bun run start --rebuild
```

---

## 📁 Output & Logging

- **Predictions:** Written to `../support_tickets/output.csv`.
- **Ticket Traces:** Written to `logs/ticket-XXX.json`. Open these to see the exact queries, scores, and decision logic for any ticket.
- **Run Summary:** Written to `logs/summary.json` containing accuracy, duration, and confidence averages.

---

## 🛠️ Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript (Strict mode)
- **AI/LLM:** OpenAI API (`gpt-4o` for logic, `text-embedding-3-small` for embeddings)
- **Vector Store:** `vectra` (Local, serverless JSON-based vector database)
- **Validation:** `zod`
- **CLI/UI:** `ora` (spinners), `chalk` (colors), `boxen` (banners), `cli-table3` (stats)
- **Parsing:** `csv-parse`, `csv-stringify`, `gray-matter` (markdown frontmatter)

---

*Designed for the HackerRank Orchestrate Hackathon — May 2026*
