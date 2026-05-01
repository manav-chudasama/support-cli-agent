# Support Triage Agent

A terminal-based AI agent that triages support tickets across **HackerRank**, **Claude**, and **Visa** ecosystems using a local support corpus.

## Architecture

```
Ticket CSV → Parse → Retrieve (vector search) → Classify (LLM) → Escalation Gate → Respond (LLM) → Output CSV
```

**Key design decisions:**
- **Structured pipeline** over agentic loop — deterministic, debuggable, auditable
- **Vector retrieval** (vectra) for precise corpus lookup from 774 markdown articles
- **Rule-based + LLM-informed escalation** — explicit safety gates, no silent failures
- **Grounded responses only** — strict system prompts enforce corpus-only sourcing

## Prerequisites

- [Bun](https://bun.sh/) v1.2+
- OpenAI API key

## Setup

```bash
cd code
bun install
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
```

## Usage

```bash
# Run on the main support_tickets.csv
bun run start

# Run on sample_support_tickets.csv (for development/testing)
bun run start:sample

# Force rebuild the vector index
bun run start:rebuild
```

## Project Structure

```
code/
├── src/
│   ├── main.ts          # CLI entry point — orchestrates the pipeline
│   ├── config.ts        # Environment config + path resolution
│   ├── schemas.ts       # Zod schemas for all data structures
│   ├── ui.ts            # Rich terminal UI (spinners, progress, tables)
│   ├── csv-io.ts        # CSV reading and writing
│   ├── corpus-loader.ts # Corpus walking, parsing, chunking
│   ├── indexer.ts       # Embedding + vectra vector store
│   ├── retriever.ts     # Domain-scoped retrieval
│   ├── classifier.ts    # LLM-powered ticket classification
│   ├── escalation.ts    # Rule-based escalation gate
│   └── responder.ts     # Grounded response generation
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Pipeline Stages

1. **Corpus Loading** — Walks `data/` directories, parses YAML frontmatter, cleans markdown
2. **Indexing** — Chunks articles (~500 words), embeds via OpenAI, stores in vectra (cached)
3. **Ticket Parsing** — Reads CSV, normalizes company names, validates with Zod
4. **Retrieval** — Domain-scoped vector search, falls back to cross-domain for `None`
5. **Classification** — LLM structured output: request type, product area, risk level
6. **Escalation** — Rule-based gates + LLM risk signal → `replied` or `escalated`
7. **Response** — Grounded generation with corpus-only sourcing, or escalation message
8. **Output** — Validated and written to `support_tickets/output.csv`

## Escalation Logic

The agent escalates when:
- Risk is `critical` (fraud, identity theft, security vulnerabilities)
- Risk is `high` and corpus doesn't cover the topic
- Ticket involves: account restoration, score changes, refunds, subscription cancellation
- Vague requests with insufficient context and no company
- System outages or broad failures

The agent replies (even as `invalid`) when:
- Topic is off-topic with no risk
- Simple acknowledgments (thank you)
- Prompt injection attempts (replied as out-of-scope, not escalated)

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | (required) | Your OpenAI API key |
| `OPENAI_MODEL` | `gpt-4o` | Model for classification and response |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `RETRIEVAL_TOP_K` | `8` | Number of chunks to retrieve |
| `RETRIEVAL_THRESHOLD` | `0.68` | Minimum similarity score |
