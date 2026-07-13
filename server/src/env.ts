import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",

  databaseUrl: required("DATABASE_URL"),

  evolutionApiUrl: process.env.EVOLUTION_API_URL ?? "",
  evolutionApiKey: process.env.EVOLUTION_API_KEY ?? "",
  evolutionInstanceName: process.env.EVOLUTION_INSTANCE_NAME ?? "kompass-assistant",
  // Shared secret Evolution API sends back on every webhook call (as X-Webhook-Secret) so we can
  // verify a request actually came from our own instance, not an arbitrary internet caller.
  webhookSecret: process.env.WEBHOOK_SECRET ?? "",

  // Telegram is offered as a second channel alongside WhatsApp — official Bot API, doesn't share
  // WhatsApp Web's connection-limit/ban fragility, same conversation engine underneath.
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",

  // Default/fallback provider used until an admin picks one in the panel (persisted in the
  // Settings table). Mistral is offered as an EU-hosted alternative for EU AI Act considerations;
  // all three share the same conversation/tool-calling architecture, just a different backend.
  aiProvider: (process.env.AI_PROVIDER ?? "anthropic") as "anthropic" | "mistral" | "openai",

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",

  mistralApiKey: process.env.MISTRAL_API_KEY ?? "",
  mistralModel: process.env.MISTRAL_MODEL ?? "mistral-large-latest",

  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o",

  msClientId: process.env.MS_CLIENT_ID ?? "",
  msClientSecret: process.env.MS_CLIENT_SECRET ?? "",
  msTenant: process.env.MS_TENANT ?? "common",

  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? "",

  adminUsername: process.env.ADMIN_USERNAME ?? "admin",
  adminPassword: process.env.ADMIN_PASSWORD ?? "change-me",
  adminJwtSecret: process.env.ADMIN_JWT_SECRET ?? "dev-secret",

  wordpressSiteUrl: process.env.WORDPRESS_SITE_URL ?? "https://www.kompassfrankfurt.de",
};
