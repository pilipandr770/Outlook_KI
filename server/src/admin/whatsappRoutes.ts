import { Router } from "express";
import { requireAdmin } from "./authMiddleware";
import { asyncHandler } from "../asyncHandler";
import { getWhatsAppStatus, connectWhatsAppInstance, disconnectWhatsAppInstance } from "../whatsapp/evolutionClient";
import { env } from "../env";

export const whatsappAdminRouter = Router();
whatsappAdminRouter.use(requireAdmin);

whatsappAdminRouter.get(
  "/whatsapp/status",
  asyncHandler(async (_req, res) => {
    const status = await getWhatsAppStatus();
    res.json(status);
  })
);

whatsappAdminRouter.post(
  "/whatsapp/connect",
  asyncHandler(async (_req, res) => {
    const webhookUrl = `${env.publicBaseUrl}/webhooks/whatsapp`;
    const qr = await connectWhatsAppInstance(webhookUrl);
    res.json(qr);
  })
);

whatsappAdminRouter.post(
  "/whatsapp/disconnect",
  asyncHandler(async (_req, res) => {
    await disconnectWhatsAppInstance();
    res.sendStatus(204);
  })
);
