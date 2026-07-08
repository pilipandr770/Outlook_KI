import axios from "axios";
import { env } from "../env";

const client = axios.create({
  baseURL: env.evolutionApiUrl,
  headers: { apikey: env.evolutionApiKey },
});

function toRemoteNumber(phone: string): string {
  return phone.includes("@") ? phone : `${phone}@s.whatsapp.net`;
}

export async function sendText(toPhone: string, text: string): Promise<void> {
  await client.post(`/message/sendText/${env.evolutionInstanceName}`, {
    number: toRemoteNumber(toPhone),
    text,
  });
}

export async function fetchMediaBase64(messageKey: unknown): Promise<string> {
  const { data } = await client.post(`/chat/getBase64FromMediaMessage/${env.evolutionInstanceName}`, {
    message: { key: messageKey },
  });
  return data.base64 as string;
}

export async function configureWebhook(webhookUrl: string): Promise<void> {
  await client.post(`/webhook/set/${env.evolutionInstanceName}`, {
    webhook: {
      url: webhookUrl,
      enabled: true,
      events: ["MESSAGES_UPSERT"],
    },
  });
}
