import { sendText as sendWhatsAppText } from "../whatsapp/evolutionClient";
import { sendText as sendTelegramText } from "../telegram/telegramClient";

export type ChannelName = "whatsapp" | "telegram";

const adapters: Record<ChannelName, (clientId: string, text: string) => Promise<void>> = {
  whatsapp: sendWhatsAppText,
  telegram: sendTelegramText,
};

export function sendReply(channel: ChannelName, clientId: string, text: string): Promise<void> {
  return adapters[channel](clientId, text);
}
