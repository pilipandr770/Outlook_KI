import { Router } from "express";
import { db } from "../db";
import { sendText } from "../whatsapp/evolutionClient";
import { asyncHandler } from "../asyncHandler";

export const formRouter = Router();

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

formRouter.get(
  "/:token",
  asyncHandler(async (req, res) => {
    const submission = await db.formSubmission.findUnique({ where: { token: req.params.token } });
    if (!submission) {
      res.status(404).send("Formular nicht gefunden oder abgelaufen.");
      return;
    }
    if (submission.submittedAt) {
      res.send("Dieses Formular wurde bereits ausgefüllt. Vielen Dank!");
      return;
    }

    res.send(`<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Kompass Frankfurt — Formular</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:2rem auto;padding:0 1rem}
label{display:block;margin-top:1rem;font-weight:600}
input,textarea{width:100%;padding:.5rem;margin-top:.25rem;box-sizing:border-box}
button{margin-top:1.5rem;padding:.75rem 1.5rem;background:#1a3c34;color:#fff;border:0;border-radius:4px;cursor:pointer}</style>
</head><body>
<h2>Kompass Frankfurt — ${escapeHtml(submission.formType)}</h2>
<form method="POST">
  <label>Name<input name="name" required></label>
  <label>E-Mail<input name="email" type="email"></label>
  <label>Nachricht / Details<textarea name="details" rows="4"></textarea></label>
  <button type="submit">Absenden</button>
</form>
</body></html>`);
  })
);

formRouter.post(
  "/:token",
  asyncHandler(async (req, res) => {
    const submission = await db.formSubmission.findUnique({ where: { token: req.params.token } });
    if (!submission || submission.submittedAt) {
      res.status(404).send("Formular nicht gefunden oder abgelaufen.");
      return;
    }

    await db.formSubmission.update({
      where: { token: req.params.token },
      data: { payload: req.body, submittedAt: new Date() },
    });

    const lastAppointment = await db.appointment.findFirst({
      where: { conversationId: submission.conversationId },
      orderBy: { createdAt: "desc" },
      include: { advisor: true },
    });
    if (lastAppointment) {
      await sendText(
        lastAppointment.advisor.whatsappNumber,
        `📝 Formular "${submission.formType}" wurde ausgefüllt von ${req.body.name ?? "Kunde"}.`
      );
    }

    res.send("Vielen Dank! Ihre Angaben wurden übermittelt.");
  })
);
