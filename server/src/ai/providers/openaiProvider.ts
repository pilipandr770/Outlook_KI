import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { env } from "../../env";
import { toolDefinitions, executeTool } from "../tools";
import { AiProvider, HistoryMessage, buildSystemPrompt } from "./types";

const openai = new OpenAI({ apiKey: env.openaiApiKey });

const openaiTools: ChatCompletionTool[] = toolDefinitions.map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

export const openaiProvider: AiProvider = {
  async converse(history: HistoryMessage[], knowledgeContext: string, conversationId: string): Promise<string> {
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: buildSystemPrompt(knowledgeContext) },
      ...history.map((m): ChatCompletionMessageParam => ({ role: m.role, content: m.content })),
    ];

    let completion = await openai.chat.completions.create({
      model: env.openaiModel,
      messages,
      tools: openaiTools,
      tool_choice: "auto",
    });
    let message = completion.choices[0].message;

    while (message.tool_calls && message.tool_calls.length > 0) {
      messages.push({ role: "assistant", content: message.content, tool_calls: message.tool_calls });

      for (const toolCall of message.tool_calls) {
        if (toolCall.type !== "function") continue; // we only ever register function-type tools
        let result: unknown;
        try {
          const args = JSON.parse(toolCall.function.arguments);
          result = await executeTool(toolCall.function.name, args as Record<string, unknown>, conversationId);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result) });
      }

      completion = await openai.chat.completions.create({
        model: env.openaiModel,
        messages,
        tools: openaiTools,
        tool_choice: "auto",
      });
      message = completion.choices[0].message;
    }

    return message.content ?? "";
  },
};
