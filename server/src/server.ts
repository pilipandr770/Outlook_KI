import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { env } from "./env";
import { whatsappWebhookRouter } from "./whatsapp/webhook";
import { authRouter } from "./admin/authMiddleware";
import { advisorRouter } from "./admin/advisorRoutes";
import { whatsappAdminRouter } from "./admin/whatsappRoutes";
import { calendarOAuthRouter } from "./calendar/oauthRoutes";
import { formRouter } from "./forms/formRoutes";
import { scheduleKnowledgeSync, syncKnowledgeBase } from "./knowledge/wpSync";

// A single bad request/tool-call must not take the WhatsApp bot down for every advisor —
// log and keep serving rather than let Node's default crash-on-unhandled-rejection behavior apply.
process.on("unhandledRejection", (err) => console.error("Unhandled rejection", err));
process.on("uncaughtException", (err) => console.error("Uncaught exception", err));

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/webhooks", whatsappWebhookRouter);
app.use("/admin/auth", authRouter);
app.use("/admin/api", advisorRouter);
app.use("/admin/api", whatsappAdminRouter);
app.use("/calendar", calendarOAuthRouter);
app.use("/forms", formRouter);

// Last-resort safety net: asyncHandler already routes rejections here via next(err),
// but this also catches sync throws express itself forwards. Without it, an uncaught
// error would otherwise crash the whole process (see asyncHandler.ts for why that matters).
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled request error", err);
  if (!res.headersSent) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

app.listen(env.port, () => {
  console.log(`Kompass Assistant server listening on port ${env.port}`);
  scheduleKnowledgeSync();
  syncKnowledgeBase().catch((err) => console.error("Initial knowledge sync failed", err));
});
