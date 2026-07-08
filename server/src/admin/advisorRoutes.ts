import { Router } from "express";
import { db } from "../db";
import { requireAdmin } from "./authMiddleware";
import { buildAuthUrl } from "../calendar/msal";
import { asyncHandler } from "../asyncHandler";

export const advisorRouter = Router();
advisorRouter.use(requireAdmin);

advisorRouter.get(
  "/advisors",
  asyncHandler(async (_req, res) => {
    const advisors = await db.advisor.findMany({ orderBy: { createdAt: "asc" } });
    res.json(
      advisors.map((a) => ({
        id: a.id,
        name: a.name,
        directions: a.directions,
        whatsappNumber: a.whatsappNumber,
        active: a.active,
        calendarConnected: !!a.calendarConnectedAt,
        calendarUpn: a.calendarUpn,
      }))
    );
  })
);

advisorRouter.post(
  "/advisors",
  asyncHandler(async (req, res) => {
    const { name, directions, whatsappNumber } = req.body as { name: string; directions: string; whatsappNumber: string };
    const advisor = await db.advisor.create({ data: { name, directions, whatsappNumber } });
    res.status(201).json(advisor);
  })
);

advisorRouter.put(
  "/advisors/:id",
  asyncHandler(async (req, res) => {
    const { name, directions, whatsappNumber, active } = req.body as {
      name?: string;
      directions?: string;
      whatsappNumber?: string;
      active?: boolean;
    };
    const advisor = await db.advisor.update({
      where: { id: req.params.id },
      data: { name, directions, whatsappNumber, active },
    });
    res.json(advisor);
  })
);

advisorRouter.delete(
  "/advisors/:id",
  asyncHandler(async (req, res) => {
    await db.advisor.delete({ where: { id: req.params.id } });
    res.sendStatus(204);
  })
);

advisorRouter.get(
  "/advisors/:id/calendar-auth-url",
  asyncHandler(async (req, res) => {
    const url = await buildAuthUrl(req.params.id);
    res.json({ url });
  })
);
