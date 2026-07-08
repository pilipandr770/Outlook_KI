import { db } from "../db";
import { converse } from "../ai";
import { relevantKnowledge } from "../knowledge/retrieve";
import { sendText } from "../whatsapp/evolutionClient";

const HISTORY_WINDOW = 20;

export async function handleIncomingMessage(clientPhone: string, text: string, mediaType: "text" | "audio"): Promise<void> {
  const conversation = await db.conversation.upsert({
    where: { clientPhone },
    create: { clientPhone },
    update: {},
  });

  await db.message.create({
    data: { conversationId: conversation.id, role: "user", content: text, mediaType },
  });

  const historyRows = await db.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    take: HISTORY_WINDOW,
  });

  const knowledge = await relevantKnowledge(text);

  const reply = await converse(
    historyRows.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    knowledge,
    conversation.id
  );

  if (!reply) return;

  await db.message.create({
    data: { conversationId: conversation.id, role: "assistant", content: reply, mediaType: "text" },
  });

  await sendText(clientPhone, reply);
}
