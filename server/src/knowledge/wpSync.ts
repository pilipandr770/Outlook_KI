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
  // The generic wp/v2/tribe_events endpoint has no date/time fields at all — confirmed the
  // assistant telling a real user it only had unreadable internal codes, not real dates.
  // Synced separately via syncTribeEvents() using the Events Calendar plugin's own REST API,
  // which exposes start/end date, venue+address, cost, and organizer.
  "tribe_events",
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

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  nbsp: " ",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function stripHtml(html: string): string {
  return decodeEntities(
    html
      // <style>/<script> tag-stripping alone leaves their text content behind as visible
      // "content" — the page builder inlines a <style> block with raw CSS on most pages
      // (confirmed: Kontakt/Angebot page text literally started with ".vcex_...{height:80px;}").
      // Remove the whole block, not just the tags.
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      // The site's page builder (WPBakery/Visual Composer) leaves raw [vc_row]/[vcex_...]
      // shortcode syntax in `content.rendered` on most pages — confirmed 23/34 pages affected,
      // including Kontakt/Angebot/Events. Strip shortcode tags before/after HTML tag removal.
      .replace(/\[\/?[a-z_][a-z0-9_-]*(?:\s[^\]]*)?\]/gi, " ")
  )
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

interface TribeEvent {
  id: number;
  title: string;
  description?: string;
  url: string;
  start_date: string; // "YYYY-MM-DD HH:MM:SS", already in event-local time — for display only
  end_date: string;
  utc_start_date: string; // "YYYY-MM-DD HH:MM:SS" in UTC — unambiguous, used for sorting/filtering
  all_day: boolean;
  cost?: string;
  venue?: { venue?: string; address?: string; city?: string };
  organizer?: { organizer?: string; email?: string }[];
}

function formatEventDateRange(startDate: string, endDate: string, allDay: boolean): string {
  const [startDay, startTime] = startDate.split(" ");
  const [endDay, endTime] = endDate.split(" ");
  const fmt = (d: string) => d.split("-").reverse().join(".");

  if (allDay) return startDay === endDay ? `${fmt(startDay)} (ganztägig)` : `${fmt(startDay)} – ${fmt(endDay)} (ganztägig)`;
  if (startDay === endDay) return `${fmt(startDay)}, ${startTime.slice(0, 5)}–${endTime.slice(0, 5)} Uhr`;
  return `${fmt(startDay)} ${startTime.slice(0, 5)} Uhr – ${fmt(endDay)} ${endTime.slice(0, 5)} Uhr`;
}

async function fetchAllTribeEvents(): Promise<TribeEvent[]> {
  const all: TribeEvent[] = [];
  let page = 1;
  for (;;) {
    const { data } = await axios.get(`${env.wordpressSiteUrl}/wp-json/tribe/events/v1/events`, {
      params: { per_page: 50, page },
    });
    all.push(...data.events);
    if (page >= data.total_pages || data.events.length === 0) break;
    page += 1;
  }
  return all;
}

async function syncTribeEvents(): Promise<number> {
  const events = await fetchAllTribeEvents();
  const seenIds: number[] = [];

  for (const e of events) {
    const venueParts = [e.venue?.venue, e.venue?.address, e.venue?.city].filter(Boolean);
    const organizer = e.organizer?.[0];

    const content = [
      `Termin: ${formatEventDateRange(e.start_date, e.end_date, e.all_day)}`,
      venueParts.length > 0 && `Ort: ${venueParts.join(", ")}`,
      e.cost && `Kosten: ${e.cost}`,
      organizer?.organizer && `Veranstalter: ${organizer.organizer}${organizer.email ? ` (${organizer.email})` : ""}`,
      stripHtml(e.description ?? ""),
    ]
      .filter(Boolean)
      .join("\n");

    seenIds.push(e.id);
    const eventDate = new Date(`${e.utc_start_date.replace(" ", "T")}Z`);
    await db.knowledgeDocument.upsert({
      where: { sourceType_sourceId: { sourceType: "tribe_events", sourceId: e.id } },
      create: { sourceType: "tribe_events", sourceId: e.id, title: decodeEntities(e.title), content, url: e.url, eventDate },
      update: { title: decodeEntities(e.title), content, url: e.url, eventDate },
    });
  }

  await db.knowledgeDocument.deleteMany({
    where: { sourceType: "tribe_events", sourceId: { notIn: seenIds } },
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

  let typeCount = types.length;
  try {
    total += await syncTribeEvents();
    typeCount += 1;
  } catch (err) {
    const detail = axios.isAxiosError(err) ? `${err.response?.status} ${err.response?.statusText}` : String(err);
    console.error(`Knowledge sync failed for tribe_events (dedicated endpoint): ${detail}`);
  }

  // One-time-per-run cleanup: drop any leftover documents from types no longer synced at all
  // (e.g. a type that got explicitly excluded, or a plugin that was removed from the site).
  // tribe_events is synced separately above (dedicated endpoint), not part of `types`.
  const activeSourceTypes = [...types.map((t) => t.rest_base), "tribe_events"];
  await db.knowledgeDocument.deleteMany({ where: { sourceType: { notIn: activeSourceTypes } } });

  console.log(`Knowledge base sync complete: ${total} documents across ${typeCount} content types`);
}

export function scheduleKnowledgeSync(): void {
  // Daily at 06:00 Europe/Berlin
  cron.schedule("0 6 * * *", () => {
    syncKnowledgeBase().catch((err) => logError("Scheduled knowledge sync failed", err));
  }, { timezone: "Europe/Berlin" });
}
