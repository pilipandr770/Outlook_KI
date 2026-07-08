import { Mistral } from "@mistralai/mistralai";
import type { ChatCompletionRequest } from "@mistralai/mistralai/models/components";
import { env } from "../../env";
import { toolDefinitions, executeTool } from "../tools";
import { AiProvider, HistoryMessage, buildSystemPrompt } from "./types";

const mistral = new Mistral({ apiKey: env.mistralApiKey });

const mistralTools = toolDefinitions.map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

// Matches whatever message shape this SDK version actually expects, rather than
// a hand-rolled union that drifts from it (chat.complete's own param type disagreed
// with a hand-written union on the optionality of `role`).
type ChatMessage = ChatCompletionRequest["messages"][number];

export const mistralProvider: AiProvider = {
  async converse(history: HistoryMessage[], knowledgeContext: string, conversationId: string): Promise<string> {
    const messages: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(knowledgeContext) },
      ...history.map((m): ChatMessage => ({ role: m.role, content: m.content })),
    ];

    let response = await mistral.chat.complete({
      model: env.mistralModel,
      messages,
      tools: mistralTools,
      toolChoice: "auto",
    });

    let message = response.choices?.[0]?.message;

    while (message?.toolCalls && message.toolCalls.length > 0) {
      messages.push({ role: "assistant", content: message.content ?? "", toolCalls: message.toolCalls });

      for (const toolCall of message.toolCalls) {
        const fn = toolCall.function;
        let result: unknown;
        try {
          const args = typeof fn.arguments === "string" ? JSON.parse(fn.arguments) : fn.arguments;
          result = await executeTool(fn.name, args as Record<string, unknown>, conversationId);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }
        messages.push({ role: "tool", name: fn.name, content: JSON.stringify(result), toolCallId: toolCall.id ?? "" });
      }

      response = await mistral.chat.complete({
        model: env.mistralModel,
        messages,
        tools: mistralTools,
        toolChoice: "auto",
      });
      message = response.choices?.[0]?.message;
    }

    const content = message?.content;
    return typeof content === "string" ? content : "";
  },
};
