import { Router } from "express";
import { db } from "../db";
import { exchangeCodeForTokens } from "./msal";
import { encrypt } from "../security/crypto";
import { asyncHandler } from "../asyncHandler";

export const calendarOAuthRouter = Router();

calendarOAuthRouter.get("/oauth/callback", asyncHandler(async (req, res) => {
  const { code, state: advisorId } = req.query as { code?: string; state?: string };
  if (!code || !advisorId) {
    res.status(400).send("Missing code or advisor reference");
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await db.advisor.update({
      where: { id: advisorId },
      data: {
        calendarRefreshToken: encrypt(tokens.refreshToken),
        calendarUpn: tokens.upn,
        calendarConnectedAt: new Date(),
      },
    });
    res.send("Outlook-Kalender erfolgreich verbunden. Sie können dieses Fenster jetzt schließen.");
  } catch (err) {
    console.error("Calendar OAuth callback failed", err);
    res.status(500).send("Verbindung fehlgeschlagen. Bitte erneut versuchen.");
  }
}));
