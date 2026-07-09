import crypto from "crypto";
import { ConfidentialClientApplication } from "@azure/msal-node";
import { env } from "../env";

const SCOPES = ["offline_access", "User.Read", "Calendars.ReadWrite"];
const STATE_TTL_MS = 10 * 60 * 1000;

export const redirectUri = `${env.publicBaseUrl}/calendar/oauth/callback`;

// Constructed fresh per call rather than as a shared singleton — msal-node's token cache is a
// single flat object with no per-account isolation, so a cache shared across every advisor let
// one advisor's refresh token silently overwrite another's (confirmed against msal-node's cache
// internals: the cache preserves insertion order, so index [0] is always whichever advisor
// connected first). A fresh app/cache per call guarantees the only entry present after the call
// is the one just produced. These objects are cheap — no persistent connection is held.
function msalApp(): ConfidentialClientApplication {
  if (!env.msClientId || !env.msClientSecret) {
    throw new Error("Microsoft Graph calendar integration is not configured yet (MS_CLIENT_ID/MS_CLIENT_SECRET missing)");
  }
  return new ConfidentialClientApplication({
    auth: {
      clientId: env.msClientId,
      clientSecret: env.msClientSecret,
      authority: `https://login.microsoftonline.com/${env.msTenant}`,
    },
  });
}

// OAuth `state` must not be the bare advisor id: it's an opaque value Microsoft echoes back
// unmodified regardless of who completes consent, so anyone who knows an advisor's id could run
// their own consent flow with state=<that id> and have their own account's tokens stored under
// that advisor's row. Signing it (HMAC + expiry) means only a state value this server itself
// issued for that advisor, recently, will be accepted in the callback.
function signState(advisorId: string): string {
  const payload = `${advisorId}.${Date.now()}`;
  const signature = crypto.createHmac("sha256", env.tokenEncryptionKey).update(payload).digest("hex");
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

function verifyState(state: string): string {
  const decoded = Buffer.from(state, "base64url").toString("utf8");
  const parts = decoded.split(".");
  if (parts.length !== 3) throw new Error("Malformed OAuth state");
  const [advisorId, timestamp, signature] = parts;

  const expected = crypto.createHmac("sha256", env.tokenEncryptionKey).update(`${advisorId}.${timestamp}`).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    throw new Error("Invalid OAuth state signature");
  }
  if (Date.now() - Number(timestamp) > STATE_TTL_MS) {
    throw new Error("OAuth state expired — please click Outlook verbinden again");
  }
  return advisorId;
}

export async function buildAuthUrl(advisorId: string): Promise<string> {
  return msalApp().getAuthCodeUrl({
    scopes: SCOPES,
    redirectUri,
    state: signState(advisorId),
  });
}

export interface ExchangedTokens {
  advisorId: string;
  accessToken: string;
  refreshToken: string;
  upn: string;
}

export async function exchangeCodeForTokens(code: string, state: string): Promise<ExchangedTokens> {
  const advisorId = verifyState(state);
  const app = msalApp();

  const result = await app.acquireTokenByCode({
    code,
    scopes: SCOPES,
    redirectUri,
  });
  if (!result) throw new Error("MSAL returned no result for authorization code exchange");

  const cache = app.getTokenCache().serialize();
  const parsed = JSON.parse(cache);
  const refreshTokenEntry = Object.values(parsed.RefreshToken ?? {})[0] as { secret: string } | undefined;
  if (!refreshTokenEntry) throw new Error("No refresh token found in MSAL cache after code exchange");

  return {
    advisorId,
    accessToken: result.accessToken,
    refreshToken: refreshTokenEntry.secret,
    upn: result.account?.username ?? "",
  };
}

export async function getAccessTokenFromRefreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const app = msalApp();
  const result = await app.acquireTokenByRefreshToken({
    refreshToken,
    scopes: SCOPES,
  });
  if (!result) throw new Error("Failed to refresh Microsoft Graph access token");

  const cache = app.getTokenCache().serialize();
  const parsed = JSON.parse(cache);
  const refreshTokenEntry = Object.values(parsed.RefreshToken ?? {})[0] as { secret: string } | undefined;

  return {
    accessToken: result.accessToken,
    refreshToken: refreshTokenEntry?.secret ?? refreshToken,
  };
}
