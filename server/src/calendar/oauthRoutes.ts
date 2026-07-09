import { Router } from "express";
import { db } from "../db";
import { exchangeCodeForTokens } from "./msal";
import { encrypt } from "../security/crypto";
import { asyncHandler } from "../asyncHandler";
import { logError } from "../logging";

export const calendarOAuthRouter = Router();

calendarOAuthRouter.get(
  "/oauth/callback",
  asyncHandler(async (req, res) => {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state) {
      res.status(400).send("Missing code or state");
      return;
    }

    try {
      // exchangeCodeForTokens verifies state's HMAC+expiry and returns the advisorId it was
      // signed for — the DB write is keyed off that verified value, not the raw query param.
      const tokens = await exchangeCodeForTokens(code, state);
      await db.advisor.update({
        where: { id: tokens.advisorId },
        data: {
          calendarRefreshToken: encrypt(tokens.refreshToken),
          calendarUpn: tokens.upn,
          calendarConnectedAt: new Date(),
        },
      });
      res.send("Outlook-Kalender erfolgreich verbunden. Sie können dieses Fenster jetzt schließen.");
    } catch (err) {
      logError("Calendar OAuth callback failed", err);
      res.status(500).send("Verbindung fehlgeschlagen. Bitte erneut versuchen.");
    }
  })
);
