import axios from "axios";
import cron from "node-cron";
import { env } from "../env";
import { db } from "../db";

const EXCLUDED_TYPE_KEYS = new Set(["attachment", "nav_menu_item"]);

interface WpType {
  rest_base: string;
  name: string;
}

// WordPress core registers several internal types (wp_block, wp_template, wp_navigation,
// wp_font_family, ...) whose REST routes require authentication and are irrelevant as
// customer-facing knowledge. Filter by prefix/shape rather than an exhaustive blacklist,
// since new "wp_*" internal types get added across WP versions.
function isContentType(key: string, type: WpType): boolean {
  if (EXCLUDED_TYPE_KEYS.has(key) || key.startsWith("wp_")) return false;
  if (!/^[a-z0-9-]+$/.test(type.rest_base)) return false; // drops nested/templated routes
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

async function syncType(type: WpType): Promise<number> {
  const { data } = await axios.get<WpEntity[]>(`${env.wordpressSiteUrl}/wp-json/wp/v2/${type.rest_base}`, {
    params: { per_page: 100 },
  });

  for (const entity of data) {
    const content = stripHtml(entity.content?.rendered ?? entity.excerpt?.rendered ?? "");
    if (!content) continue;

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

  return data.length;
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
  console.log(`Knowledge base sync complete: ${total} documents across ${types.length} content types`);
}

export function scheduleKnowledgeSync(): void {
  // Daily at 06:00 Europe/Berlin
  cron.schedule("0 6 * * *", () => {
    syncKnowledgeBase().catch((err) => console.error("Scheduled knowledge sync failed", err));
  }, { timezone: "Europe/Berlin" });
}
