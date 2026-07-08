import { env } from "../env";
import { AiProvider, HistoryMessage } from "./providers/types";

let provider: AiProvider | undefined;

// Loaded lazily so a missing/misconfigured API key for the *unselected* provider
// never blocks server startup (mirrors the calendar module's lazy-init fix).
function getProvider(): AiProvider {
  if (provider) return provider;

  if (env.aiProvider === "mistral") {
    provider = require("./providers/mistralProvider").mistralProvider;
  } else {
    provider = require("./providers/anthropicProvider").anthropicProvider;
  }
  return provider!;
}

export async function converse(history: HistoryMessage[], knowledgeContext: string, conversationId: string): Promise<string> {
  return getProvider().converse(history, knowledgeContext, conversationId);
}
