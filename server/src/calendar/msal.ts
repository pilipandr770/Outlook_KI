import { ConfidentialClientApplication } from "@azure/msal-node";
import { env } from "../env";

const SCOPES = ["offline_access", "User.Read", "Calendars.ReadWrite"];

export const redirectUri = `${env.publicBaseUrl}/calendar/oauth/callback`;

let cachedApp: ConfidentialClientApplication | undefined;

// Constructed lazily so the server can boot (WhatsApp/Claude/knowledge base all work)
// before an Azure AD app is registered — calendar features just fail until MS_CLIENT_ID/SECRET are set.
function msalApp(): ConfidentialClientApplication {
  if (!env.msClientId || !env.msClientSecret) {
    throw new Error("Microsoft Graph calendar integration is not configured yet (MS_CLIENT_ID/MS_CLIENT_SECRET missing)");
  }
  if (!cachedApp) {
    cachedApp = new ConfidentialClientApplication({
      auth: {
        clientId: env.msClientId,
        clientSecret: env.msClientSecret,
        authority: `https://login.microsoftonline.com/${env.msTenant}`,
      },
    });
  }
  return cachedApp;
}

export async function buildAuthUrl(advisorId: string): Promise<string> {
  return msalApp().getAuthCodeUrl({
    scopes: SCOPES,
    redirectUri,
    state: advisorId,
  });
}

export interface ExchangedTokens {
  accessToken: string;
  refreshToken: string;
  upn: string;
}

export async function exchangeCodeForTokens(code: string): Promise<ExchangedTokens> {
  const result = await msalApp().acquireTokenByCode({
    code,
    scopes: SCOPES,
    redirectUri,
  });
  if (!result) throw new Error("MSAL returned no result for authorization code exchange");

  // msal-node doesn't expose the refresh token on AuthenticationResult directly;
  // it's retrieved from the internal token cache after the exchange.
  const cache = msalApp().getTokenCache().serialize();
  const parsed = JSON.parse(cache);
  const refreshTokenEntry = Object.values(parsed.RefreshToken ?? {})[0] as { secret: string } | undefined;
  if (!refreshTokenEntry) throw new Error("No refresh token found in MSAL cache after code exchange");

  return {
    accessToken: result.accessToken,
    refreshToken: refreshTokenEntry.secret,
    upn: result.account?.username ?? "",
  };
}

export async function getAccessTokenFromRefreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const result = await msalApp().acquireTokenByRefreshToken({
    refreshToken,
    scopes: SCOPES,
  });
  if (!result) throw new Error("Failed to refresh Microsoft Graph access token");

  const cache = msalApp().getTokenCache().serialize();
  const parsed = JSON.parse(cache);
  const refreshTokenEntry = Object.values(parsed.RefreshToken ?? {})[0] as { secret: string } | undefined;

  return {
    accessToken: result.accessToken,
    refreshToken: refreshTokenEntry?.secret ?? refreshToken,
  };
}
