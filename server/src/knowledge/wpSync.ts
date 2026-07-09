import axios from "axios";
import cron from "node-cron";
import { env } from "../env";
import { db } from "../db";
import { logError } from "../logging";

const EXCLUDED_TYPE_KEYS = new Set([
  "attachment",
  "nav_menu_item",
  "mailpoet_email", // newsletter drafts, not customer-facing
  "tribe_rsvp_tickets", // ticket/RSVP records, not descriptive content
  "rm_content_editor", // reusable content snippets/blocks, same class as wp_block
  "wpex_templates", // theme page-builder templates (e.g. the 404 page), not real content
  "wpex_card", // theme page-builder cards containing raw unrendered shortcodes
  "tec_calendar_embed", // calendar embed widget config, not descriptive content
]);

interface WpType {
  rest_base: string;
  name: string;
}

// WordPress core registers several internal types (wp_block, wp_template, wp_navigation,
// wp_font_family, ...) whose REST routes require authentication and are irrelevant as
// customer-facing knowledge. Filter those by prefix, since new "wp_*" internal types get
// added across WP versions. Plugin-specific non-content types (newsletters, page-builder
// templates, ticket records) are excluded explicitly above since there's no common prefix.
// Real plugin content (e.g. tribe_events, tribe_venue from The Events Calendar) is kept —
// don't reject on underscores, only on characters that indicate a templated/parameterized
// route like the font-faces nested endpoint (contains parens, angle brackets, "?").
function isContentType(key: string, type: WpType): boolean {
  if (EXCLUDED_TYPE_KEYS.has(key) || key.startsWith("wp_")) return false;
  if (/[^a-z0-9_-]/i.test(type.rest_base)) return false;
  return true;
}

interface WpEntity {
  id: number;
  link: string;
  title: { rendered: string };
  content?: { rendered: string };
  excerpt?: { rendered: string };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function discoverContentTypes(): Promise<WpType[]> {
  const { data } = await axios.get(`${env.wordpressSiteUrl}/wp-json/wp/v2/types`);
  return Object.entries(data as Record<string, WpType>)
    .filter(([key, type]) => isContentType(key, type))
    .map(([, type]) => type);
}

async function fetchAllPages(restBase: string): Promise<WpEntity[]> {
  const all: WpEntity[] = [];
  let page = 1;
  // WordPress caps per_page at 100 and reports the true total via X-WP-TotalPages —
  // a single request silently truncates any site with more than 100 items of a type.
  for (;;) {
    const { data, headers } = await axios.get<WpEntity[]>(`${env.wordpressSiteUrl}/wp-json/wp/v2/${restBase}`, {
      params: { per_page: 100, page },
    });
    all.push(...data);

    const totalPages = Number(headers["x-wp-totalpages"] ?? 1);
    if (page >= totalPages || data.length === 0) break;
    page += 1;
  }
  return all;
}

async function syncType(type: WpType): Promise<number> {
  const entities = await fetchAllPages(type.rest_base);
  const seenIds: number[] = [];

  for (const entity of entities) {
    const content = stripHtml(entity.content?.rendered ?? entity.excerpt?.rendered ?? "");
    if (!content) continue;
    seenIds.push(entity.id);

    await db.knowledgeDocument.upsert({
      where: { sourceType_sourceId: { sourceType: type.rest_base, sourceId: entity.id } },
      create: {
        sourceType: type.rest_base,
        sourceId: entity.id,
        title: stripHtml(entity.title.rendered),
        content,
        url: entity.link,
      },
      update: {
        title: stripHtml(entity.title.rendered),
        content,
        url: entity.link,
      },
    });
  }

  // Content removed/unpublished on the site since the last sync should disappear here too.
  await db.knowledgeDocument.deleteMany({
    where: { sourceType: type.rest_base, sourceId: { notIn: seenIds } },
  });

  return seenIds.length;
}

export async function syncKnowledgeBase(): Promise<void> {
  const types = await discoverContentTypes();
  let total = 0;
  for (const type of types) {
    try {
      total += await syncType(type);
    } catch (err) {
      const detail = axios.isAxiosError(err) ? `${err.response?.status} ${err.response?.statusText}` : String(err);
      console.error(`Knowledge sync failed for WP type "${type.rest_base}": ${detail}`);
    }
  }

  // One-time-per-run cleanup: drop any leftover documents from types no longer synced at all
  // (e.g. a type that got explicitly excluded, or a plugin that was removed from the site).
  const activeSourceTypes = types.map((t) => t.rest_base);
  await db.knowledgeDocument.deleteMany({ where: { sourceType: { notIn: activeSourceTypes } } });

  console.log(`Knowledge base sync complete: ${total} documents across ${types.length} content types`);
}

export function scheduleKnowledgeSync(): void {
  // Daily at 06:00 Europe/Berlin
  cron.schedule("0 6 * * *", () => {
    syncKnowledgeBase().catch((err) => logError("Scheduled knowledge sync failed", err));
  }, { timezone: "Europe/Berlin" });
}
