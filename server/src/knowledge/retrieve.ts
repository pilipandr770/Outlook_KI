import { db } from "../db";

const STOPWORDS = new Set(["the", "and", "der", "die", "das", "und", "für", "und", "und", "ich", "und"]);

function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

export async function relevantKnowledge(userMessage: string, limit = 6): Promise<string> {
  const terms = keywords(userMessage);
  // No take() cap — corpus is ~250 documents, small enough to score in full. The previous
  // `take: 200` cap silently dropped ~36 documents from every relevance search once the site
  // sync grew past that count.
  const all = await db.knowledgeDocument.findMany({ orderBy: { updatedAt: "desc" } });

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

const SOURCE_LABELS: Record<string, string> = {
  posts: "News/Beiträge",
  pages: "Seiten",
  tribe_events: "Events",
  tribe_organizer: "Organisatoren",
  tribe_venue: "Veranstaltungsorte",
};

async function fullTopicCatalog(): Promise<string> {
  const docs = await db.knowledgeDocument.findMany({ orderBy: { title: "asc" } });
  const bySourceType = new Map<string, string[]>();
  for (const doc of docs) {
    const list = bySourceType.get(doc.sourceType) ?? [];
    list.push(doc.title);
    bySourceType.set(doc.sourceType, list);
  }
  return [...bySourceType.entries()]
    .map(([sourceType, titles]) => `${SOURCE_LABELS[sourceType] ?? sourceType} (${titles.length}):\n${titles.map((t) => `- ${t}`).join("\n")}`)
    .join("\n\n");
}

// Keyword-matched relevantKnowledge() scores badly against date-shaped questions ("this week",
// "today", "in December") since those words don't appear in any specific event's title/content —
// confirmed live: asking "what's happening this week" retrieved zero tribe_events documents even
// though 40+ have real dates. Always include the next N chronologically, independent of keywords.
async function upcomingEvents(limit = 15): Promise<string> {
  const events = await db.knowledgeDocument.findMany({
    where: { sourceType: "tribe_events", eventDate: { gte: new Date() } },
    orderBy: { eventDate: "asc" },
    take: limit,
  });
  if (events.length === 0) return "(keine anstehenden Termine gefunden)";
  return events.map((e) => `### ${e.title}\n${e.content}`).join("\n\n");
}

// Combines a full title catalog (so the assistant knows the true breadth of what it has —
// without this, it only ever saw the ~5-6 documents relevantKnowledge() matched for the
// current question and would describe THAT narrow slice as "everything I know about the site"),
// a chronological upcoming-events list, and detailed excerpts for the current question.
export async function buildKnowledgeContext(userMessage: string): Promise<string> {
  const [catalog, upcoming, excerpts] = await Promise.all([
    fullTopicCatalog(),
    upcomingEvents(),
    relevantKnowledge(userMessage),
  ]);
  return (
    `## Vollständige Themenübersicht (Titel aller Seiten/Beiträge/Events von der Website)\n${catalog}\n\n` +
    `## Anstehende Termine (chronologisch, mit Datum/Uhrzeit/Ort)\n${upcoming}\n\n` +
    `## Detaillierte Auszüge zum aktuellen Anliegen des Kunden\n${excerpts}`
  );
}
