-- Generalize Conversation from WhatsApp-only (clientPhone) to multi-channel (channel + clientId),
-- so the same conversation engine can serve Telegram (or any future channel) alongside WhatsApp.
ALTER TABLE "Conversation" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'whatsapp';

ALTER TABLE "Conversation" RENAME COLUMN "clientPhone" TO "clientId";

DROP INDEX IF EXISTS "Conversation_clientPhone_key";

CREATE UNIQUE INDEX "Conversation_channel_clientId_key" ON "Conversation"("channel", "clientId");
