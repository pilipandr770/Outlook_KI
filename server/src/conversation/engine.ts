import { db } from "../db";
import { converse } from "../ai";
import { buildKnowledgeContext } from "../knowledge/retrieve";
import { sendReply, ChannelName } from "../channels";

const HISTORY_WINDOW = 20;

export async function handleIncomingMessage(
  channel: ChannelName,
  clientId: string,
  text: string,
  mediaType: "text" | "audio"
): Promise<void> {
  const conversation = await db.conversation.upsert({
    where: { channel_clientId: { channel, clientId } },
    create: { channel, clientId },
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

  const knowledge = await buildKnowledgeContext(text);

  const reply = await converse(
    historyRows.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    knowledge,
    conversation.id
  );

  if (!reply) return;

  await db.message.create({
    data: { conversationId: conversation.id, role: "assistant", content: reply, mediaType: "text" },
  });

  await sendReply(channel, clientId, reply);
}
