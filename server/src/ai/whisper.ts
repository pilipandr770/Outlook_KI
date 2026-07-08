import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { env } from "../env";

const openai = new OpenAI({ apiKey: env.openaiApiKey });

export async function transcribeAudio(audioBuffer: Buffer, mimetype = "audio/ogg"): Promise<string> {
  const extension = mimetype.includes("ogg") ? "ogg" : mimetype.includes("mp4") ? "m4a" : "oga";
  const file = await toFile(audioBuffer, `voice-note.${extension}`);
  const result = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
  });
  return result.text;
}
