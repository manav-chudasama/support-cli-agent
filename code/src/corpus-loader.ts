/**
 * Corpus loader — walks data/ directories, parses markdown files with frontmatter,
 * and chunks them into segments for embedding.
 */

import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { paths, DOMAINS, type Domain } from "./config.js";
import type { ChunkMetadata } from "./schemas.js";

export interface CorpusChunk {
  text: string;
  metadata: ChunkMetadata;
}

export interface CorpusArticle {
  title: string;
  domain: Domain;
  category: string;
  filePath: string;
  body: string;
}

// ── Walk and parse all corpus files ────────────────────────────────────
export function loadCorpus(): CorpusArticle[] {
  const articles: CorpusArticle[] = [];

  for (const domain of DOMAINS) {
    const domainDir = path.join(paths.dataDir, domain);
    const files = walkMarkdownFiles(domainDir);

    for (const filePath of files) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const { data: frontmatter, content } = matter(raw);

      // Skip index files — they're just TOCs
      if (path.basename(filePath) === "index.md") continue;

      const title = (frontmatter.title as string) || path.basename(filePath, ".md");
      const breadcrumbs = (frontmatter.breadcrumbs as string[]) || [];
      const relativePath = path.relative(domainDir, filePath);
      const category = breadcrumbs.length > 0
        ? breadcrumbs.join(" > ")
        : path.dirname(relativePath).replace(/[\\/]/g, " > ");

      // Clean body: remove image embeds, strip excessive whitespace
      const body = cleanMarkdown(content);

      if (body.trim().length < 20) continue; // skip near-empty files

      articles.push({
        title,
        domain: domain as Domain,
        category,
        filePath: relativePath,
        body,
      });
    }
  }

  return articles;
}

// ── Chunk articles into segments ───────────────────────────────────────
export function chunkArticles(
  articles: CorpusArticle[],
  chunkSize: number = 500,
  chunkOverlap: number = 50,
): CorpusChunk[] {
  const chunks: CorpusChunk[] = [];

  for (const article of articles) {
    // Prepend title and category as context for each chunk
    const prefix = `[${article.domain.toUpperCase()}] ${article.title}\nCategory: ${article.category}\n\n`;
    const words = article.body.split(/\s+/);

    if (words.length <= chunkSize) {
      // Single chunk for short articles
      chunks.push({
        text: prefix + article.body,
        metadata: {
          domain: article.domain,
          title: article.title,
          category: article.category,
          filePath: article.filePath,
          chunkIndex: 0,
        },
      });
    } else {
      // Sliding window chunking
      let chunkIndex = 0;
      for (let i = 0; i < words.length; i += chunkSize - chunkOverlap) {
        const slice = words.slice(i, i + chunkSize).join(" ");
        if (slice.trim().length < 20) continue;

        chunks.push({
          text: prefix + slice,
          metadata: {
            domain: article.domain,
            title: article.title,
            category: article.category,
            filePath: article.filePath,
            chunkIndex,
          },
        });
        chunkIndex++;
      }
    }
  }

  return chunks;
}

// ── Helpers ────────────────────────────────────────────────────────────
function walkMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMarkdownFiles(fullPath));
    } else if (entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

function cleanMarkdown(content: string): string {
  return content
    // Remove image embeds
    .replace(/!\[.*?\]\(.*?\)/g, "")
    // Remove HTML tags
    .replace(/<[^>]+>/g, "")
    // Collapse multiple newlines
    .replace(/\n{3,}/g, "\n\n")
    // Trim
    .trim();
}
