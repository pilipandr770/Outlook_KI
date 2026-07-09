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

export interface WhatsAppStatus {
  exists: boolean;
  connectionStatus: "open" | "connecting" | "close" | "unknown";
  ownerNumber: string | null;
}

export async function getWhatsAppStatus(): Promise<WhatsAppStatus> {
  const { data } = await client.get("/instance/fetchInstances");
  const instances = Array.isArray(data) ? data : [];
  const mine = instances.find((i: { name?: string }) => i.name === env.evolutionInstanceName);
  if (!mine) return { exists: false, connectionStatus: "unknown", ownerNumber: null };
  return {
    exists: true,
    connectionStatus: mine.connectionStatus ?? "unknown",
    ownerNumber: mine.ownerJid ? mine.ownerJid.split("@")[0] : null,
  };
}

export interface QrCodeResult {
  base64: string | null;
}

export async function connectWhatsAppInstance(webhookUrl: string): Promise<QrCodeResult> {
  const status = await getWhatsAppStatus();

  if (!status.exists) {
    const { data } = await client.post("/instance/create", {
      instanceName: env.evolutionInstanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    });
    await configureWebhook(webhookUrl);
    return { base64: data.qrcode?.base64 ?? null };
  }

  if (status.connectionStatus === "open") {
    return { base64: null };
  }

  const { data } = await client.get(`/instance/connect/${env.evolutionInstanceName}`);
  return { base64: data.base64 ?? null };
}

export async function disconnectWhatsAppInstance(): Promise<void> {
  await client.delete(`/instance/logout/${env.evolutionInstanceName}`);
}
