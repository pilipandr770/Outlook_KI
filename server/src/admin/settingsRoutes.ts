import { Router } from "express";
import { requireAdmin } from "./authMiddleware";
import { asyncHandler } from "../asyncHandler";
import { getCurrentProviderName, setProviderName, ProviderName } from "../ai";

const VALID_PROVIDERS: ProviderName[] = ["anthropic", "mistral", "openai"];

export const settingsRouter = Router();
settingsRouter.use(requireAdmin);

settingsRouter.get(
  "/settings",
  asyncHandler(async (_req, res) => {
    const aiProvider = await getCurrentProviderName();
    res.json({ aiProvider });
  })
);

settingsRouter.put(
  "/settings",
  asyncHandler(async (req, res) => {
    const { aiProvider } = req.body as { aiProvider?: string };
    if (!aiProvider || !VALID_PROVIDERS.includes(aiProvider as ProviderName)) {
      res.status(400).json({ error: `aiProvider must be one of: ${VALID_PROVIDERS.join(", ")}` });
      return;
    }
    await setProviderName(aiProvider as ProviderName);
    res.json({ aiProvider });
  })
);
