import axios from "axios";
import { env } from "../env";

const api = axios.create({ baseURL: `https://api.telegram.org/bot${env.telegramBotToken}` });
const fileApi = axios.create({ baseURL: `https://api.telegram.org/file/bot${env.telegramBotToken}` });

export async function sendText(chatId: string, text: string): Promise<void> {
  await api.post("/sendMessage", { chat_id: chatId, text });
}

export async function setWebhook(webhookUrl: string): Promise<void> {
  await api.post("/setWebhook", {
    url: webhookUrl,
    // Telegram's native webhook-auth mechanism — it echoes this back as
    // X-Telegram-Bot-Api-Secret-Token on every update, same secret we already use for Evolution API.
    secret_token: env.webhookSecret || undefined,
    allowed_updates: ["message"],
  });
}

export async function downloadVoice(fileId: string): Promise<Buffer> {
  const { data: fileInfo } = await api.get("/getFile", { params: { file_id: fileId } });
  const filePath = fileInfo.result.file_path as string;
  const { data } = await fileApi.get(`/${filePath}`, { responseType: "arraybuffer" });
  return Buffer.from(data);
}
