import { db } from "../db";
import { env } from "../env";
import { AiProvider, HistoryMessage } from "./providers/types";

export type ProviderName = "anthropic" | "mistral" | "openai";

const providerModules: Record<ProviderName, () => AiProvider> = {
  anthropic: () => require("./providers/anthropicProvider").anthropicProvider,
  mistral: () => require("./providers/mistralProvider").mistralProvider,
  openai: () => require("./providers/openaiProvider").openaiProvider,
};

const loadedProviders: Partial<Record<ProviderName, AiProvider>> = {};

// Each provider's SDK client is constructed at module load time, so only require() the
// one actually selected — avoids needing every provider's API key just to boot.
function getProviderInstance(name: ProviderName): AiProvider {
  if (!loadedProviders[name]) {
    loadedProviders[name] = providerModules[name]();
  }
  return loadedProviders[name]!;
}

export async function getCurrentProviderName(): Promise<ProviderName> {
  const settings = await db.settings.findUnique({ where: { id: "singleton" } });
  return (settings?.aiProvider as ProviderName | undefined) ?? env.aiProvider;
}

export async function setProviderName(name: ProviderName): Promise<void> {
  await db.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", aiProvider: name },
    update: { aiProvider: name },
  });
}

export async function converse(history: HistoryMessage[], knowledgeContext: string, conversationId: string): Promise<string> {
  const providerName = await getCurrentProviderName();
  return getProviderInstance(providerName).converse(history, knowledgeContext, conversationId);
}
