-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "aiProvider" TEXT NOT NULL DEFAULT 'anthropic',

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);
