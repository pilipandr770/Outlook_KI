import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../env";
import { toolDefinitions, executeTool } from "../tools";
import { AiProvider, HistoryMessage, buildSystemPrompt } from "./types";

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });

const anthropicTools = toolDefinitions.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.parameters,
}));

export const anthropicProvider: AiProvider = {
  async converse(history: HistoryMessage[], knowledgeContext: string, conversationId: string): Promise<string> {
    const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
    const system = buildSystemPrompt(knowledgeContext);

    let response = await anthropic.messages.create({
      model: env.anthropicModel,
      max_tokens: 1024,
      system,
      tools: anthropicTools,
      messages,
    });

    while (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        let result: unknown;
        try {
          result = await executeTool(block.name, block.input as Record<string, unknown>, conversationId);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });

      response = await anthropic.messages.create({
        model: env.anthropicModel,
        max_tokens: 1024,
        system,
        tools: anthropicTools,
        messages,
      });
    }

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    return textBlock?.text ?? "";
  },
};
