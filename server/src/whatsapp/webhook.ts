import { Router } from "express";
import crypto from "crypto";
import { fetchMediaBase64 } from "./evolutionClient";
import { transcribeAudio } from "../ai/whisper";
import { handleIncomingMessage } from "../conversation/engine";
import { env } from "../env";
import { logError } from "../logging";

export const whatsappWebhookRouter = Router();

interface EvolutionMessageEvent {
  event?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
      audioMessage?: { seconds?: number; mimetype?: string };
    };
  };
}

function extractPhone(remoteJid: string | undefined): string | null {
  if (!remoteJid) return null;
  return remoteJid.split("@")[0] ?? null;
}

// Without this, anyone who knows the webhook URL could POST a fake "messages.upsert" event
// with any remoteJid they like and make the bot send real WhatsApp messages / book real
// appointments under attacker control. The matching header is set on the Evolution API side
// in evolutionClient.ts's webhook config.
function hasValidWebhookSecret(req: { headers: Record<string, unknown> }): boolean {
  if (!env.webhookSecret) return false;
  const provided = req.headers["x-webhook-secret"];
  if (typeof provided !== "string") return false;

  const expected = Buffer.from(env.webhookSecret);
  const actual = Buffer.from(provided);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

// Evolution API's payload shape has drifted across versions — this handler
// only reads the fields it needs and ignores everything else defensively.
whatsappWebhookRouter.post("/whatsapp", async (req, res) => {
  if (!hasValidWebhookSecret(req)) {
    res.sendStatus(401);
    return;
  }

  res.sendStatus(200); // ack immediately, process async

  const body = req.body as EvolutionMessageEvent;
  if (body.event !== "messages.upsert" && body.event !== "MESSAGES_UPSERT") return;

  const data = body.data;
  if (!data || data.key?.fromMe) return;

  const clientPhone = extractPhone(data.key?.remoteJid);
  if (!clientPhone) return;

  try {
    if (data.message?.audioMessage) {
      const base64 = await fetchMediaBase64(data.key);
      const text = await transcribeAudio(Buffer.from(base64, "base64"), data.message.audioMessage.mimetype);
      await handleIncomingMessage(clientPhone, text, "audio");
      return;
    }

    const text = data.message?.conversation ?? data.message?.extendedTextMessage?.text;
    if (text) {
      await handleIncomingMessage(clientPhone, text, "text");
    }
  } catch (err) {
    logError("Failed to process incoming WhatsApp message", err);
  }
});
