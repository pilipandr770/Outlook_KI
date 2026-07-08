import { Router } from "express";
import { fetchMediaBase64 } from "./evolutionClient";
import { transcribeAudio } from "../ai/whisper";
import { handleIncomingMessage } from "../conversation/engine";

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

// Evolution API's payload shape has drifted across versions — this handler
// only reads the fields it needs and ignores everything else defensively.
whatsappWebhookRouter.post("/whatsapp", async (req, res) => {
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
    console.error("Failed to process incoming WhatsApp message", err);
  }
});
