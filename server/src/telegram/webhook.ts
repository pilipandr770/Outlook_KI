import { Router } from "express";
import crypto from "crypto";
import { downloadVoice } from "./telegramClient";
import { transcribeAudio } from "../ai/whisper";
import { handleIncomingMessage } from "../conversation/engine";
import { env } from "../env";
import { logError } from "../logging";

export const telegramWebhookRouter = Router();

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
    voice?: { file_id: string; mime_type?: string };
  };
}

// Telegram's own webhook-auth mechanism: the secret_token passed to setWebhook is echoed back
// as this header on every update, so we can verify a request actually came from Telegram —
// same shared secret and same reasoning as the WhatsApp webhook's X-Webhook-Secret check.
function hasValidSecretToken(req: { headers: Record<string, unknown> }): boolean {
  if (!env.webhookSecret) return false;
  const provided = req.headers["x-telegram-bot-api-secret-token"];
  if (typeof provided !== "string") return false;

  const expected = Buffer.from(env.webhookSecret);
  const actual = Buffer.from(provided);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

telegramWebhookRouter.post("/telegram", async (req, res) => {
  if (!hasValidSecretToken(req)) {
    res.sendStatus(401);
    return;
  }

  res.sendStatus(200); // ack immediately, process async

  const update = req.body as TelegramUpdate;
  const message = update.message;
  if (!message) return;

  const clientId = String(message.chat.id);

  try {
    if (message.voice) {
      const buffer = await downloadVoice(message.voice.file_id);
      const text = await transcribeAudio(buffer, message.voice.mime_type ?? "audio/ogg");
      await handleIncomingMessage("telegram", clientId, text, "audio");
      return;
    }

    if (message.text) {
      await handleIncomingMessage("telegram", clientId, message.text, "text");
    }
  } catch (err) {
    logError("Failed to process incoming Telegram message", err);
  }
});
