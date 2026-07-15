import { db } from "../db";
import { converse } from "../ai";
import { HistoryMessage } from "../ai/providers/types";
import { buildKnowledgeContext } from "../knowledge/retrieve";
import { sendReply, ChannelName } from "../channels";

const HISTORY_WINDOW = 20;

// Anthropic's API requires strictly alternating roles — a run of consecutive same-role
// messages (e.g. several failed turns that never got an assistant reply recorded, so the
// next attempt just adds another "user" row) gets rejected outright. Merge runs of the same
// role into one message so the array sent to any provider always alternates cleanly.
function mergeConsecutiveSameRole(messages: HistoryMessage[]): HistoryMessage[] {
  const merged: HistoryMessage[] = [];
  for (const m of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) {
      last.content += `\n${m.content}`;
    } else {
      merged.push({ ...m });
    }
  }
  return merged;
}

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

  // `take` with an ascending order returns the OLDEST N messages, not the most recent —
  // fetch newest-first then reverse. Confirmed live: once a conversation passed 20 total
  // messages, this kept sending Claude the same first-20 window forever, which eventually
  // ended on an assistant message instead of the new user message and got rejected outright
  // ("This model does not support assistant message prefill").
  const historyRowsDesc = await db.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_WINDOW,
  });
  const historyRows = historyRowsDesc.reverse();

  const knowledge = await buildKnowledgeContext(text);

  const reply = await converse(
    mergeConsecutiveSameRole(historyRows.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))),
    knowledge,
    conversation.id
  );

  if (!reply) return;

  await db.message.create({
    data: { conversationId: conversation.id, role: "assistant", content: reply, mediaType: "text" },
  });

  await sendReply(channel, clientId, reply);
}
