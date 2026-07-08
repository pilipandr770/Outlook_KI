import { db } from "../db";

const STOPWORDS = new Set(["the", "and", "der", "die", "das", "und", "für", "und", "und", "ich", "und"]);

function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

export async function relevantKnowledge(userMessage: string, limit = 5): Promise<string> {
  const terms = keywords(userMessage);
  const all = await db.knowledgeDocument.findMany({ take: 200, orderBy: { updatedAt: "desc" } });

  const scored = all
    .map((doc) => {
      const haystack = `${doc.title} ${doc.content}`.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { doc, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const picked = scored.length > 0 ? scored.map((s) => s.doc) : all.slice(0, limit);

  return picked
    .map((doc) => `### ${doc.title}\n${doc.content.slice(0, 1200)}${doc.url ? `\n(Quelle: ${doc.url})` : ""}`)
    .join("\n\n");
}

export async function serviceCatalogSummary(): Promise<string> {
  const docs = await db.knowledgeDocument.findMany({ orderBy: { title: "asc" } });
  return docs.map((d) => `- ${d.title}`).join("\n");
}
