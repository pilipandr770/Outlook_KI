import { Router, Request, Response, NextFunction } from "express";
import { env } from "../env";

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (username === env.adminUsername && password === env.adminPassword) {
    res.json({ token: env.adminJwtSecret });
    return;
  }
  res.status(401).json({ error: "Invalid credentials" });
});

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (token && token === env.adminJwtSecret) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
}
