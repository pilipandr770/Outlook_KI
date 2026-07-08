import crypto from "crypto";
import { db } from "../db";
import { getBusySlots, createCalendarEvent } from "../calendar/graph";
import { sendText } from "../whatsapp/evolutionClient";

export const toolDefinitions = [
  {
    name: "list_advisors",
    description: "List all active advisors (Berater) with their name and area of specialization/direction.",
    parameters: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "check_availability",
    description:
      "Get free time slots for a given advisor within a date range. Business hours are 09:00-17:00 Europe/Berlin, Mon-Fri, 30-minute granularity.",
    parameters: {
      type: "object" as const,
      properties: {
        advisorId: { type: "string", description: "Advisor id, from list_advisors" },
        fromDateISO: { type: "string", description: "Start of range, e.g. 2026-07-09" },
        toDateISO: { type: "string", description: "End of range, e.g. 2026-07-16" },
      },
      required: ["advisorId", "fromDateISO", "toDateISO"],
    },
  },
  {
    name: "book_appointment",
    description:
      "Book an appointment with an advisor at a specific time. Creates the event in the advisor's Outlook calendar and notifies the advisor on WhatsApp. Only call this after the client has explicitly confirmed the slot.",
    parameters: {
      type: "object" as const,
      properties: {
        advisorId: { type: "string" },
        startISO: { type: "string", description: "Appointment start, ISO 8601 with timezone" },
        durationMinutes: { type: "number", default: 30 },
        topic: { type: "string", description: "Short description of what the client wants to discuss" },
        clientName: { type: "string" },
      },
      required: ["advisorId", "startISO", "topic", "clientName"],
    },
  },
  {
    name: "send_form_link",
    description: "Generate a link to an intake form the client can fill out, to gather structured details before the appointment.",
    parameters: {
      type: "object" as const,
      properties: {
        formType: { type: "string", description: "e.g. 'intake', 'business-plan-questionnaire'" },
      },
      required: ["formType"],
    },
  },
];

function businessHourSlots(dayISO: string): { start: Date; end: Date }[] {
  const slots: { start: Date; end: Date }[] = [];
  const day = new Date(dayISO);
  if (day.getUTCDay() === 0 || day.getUTCDay() === 6) return slots;
  for (let hour = 9; hour < 17; hour++) {
    for (const minute of [0, 30]) {
      const start = new Date(day);
      start.setUTCHours(hour, minute, 0, 0);
      const end = new Date(start.getTime() + 30 * 60_000);
      slots.push({ start, end });
    }
  }
  return slots;
}

export async function executeTool(name: string, input: Record<string, unknown>, conversationId: string): Promise<unknown> {
  switch (name) {
    case "list_advisors": {
      const advisors = await db.advisor.findMany({ where: { active: true } });
      return advisors.map((a) => ({ id: a.id, name: a.name, directions: a.directions, calendarConnected: !!a.calendarConnectedAt }));
    }

    case "check_availability": {
      const { advisorId, fromDateISO, toDateISO } = input as { advisorId: string; fromDateISO: string; toDateISO: string };
      const busy = await getBusySlots(advisorId, `${fromDateISO}T00:00:00Z`, `${toDateISO}T23:59:59Z`);

      const free: string[] = [];
      const cursor = new Date(fromDateISO);
      const end = new Date(toDateISO);
      while (cursor <= end) {
        for (const slot of businessHourSlots(cursor.toISOString())) {
          const overlapsBusy = busy.some((b) => new Date(b.start) < slot.end && new Date(b.end) > slot.start);
          if (!overlapsBusy && slot.start > new Date()) free.push(slot.start.toISOString());
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      return { freeSlots: free.slice(0, 20) };
    }

    case "book_appointment": {
      const { advisorId, startISO, durationMinutes = 30, topic, clientName } = input as {
        advisorId: string;
        startISO: string;
        durationMinutes?: number;
        topic: string;
        clientName: string;
      };
      const advisor = await db.advisor.findUniqueOrThrow({ where: { id: advisorId } });
      const start = new Date(startISO);
      const end = new Date(start.getTime() + durationMinutes * 60_000);

      const graphEventId = await createCalendarEvent(advisorId, {
        subject: `Termin: ${clientName} — ${topic}`,
        startISO: start.toISOString(),
        endISO: end.toISOString(),
        body: `Gebucht über WhatsApp-Assistenten.\nThema: ${topic}\nKunde: ${clientName}`,
      });

      const appointment = await db.appointment.create({
        data: {
          advisorId,
          conversationId,
          graphEventId,
          startTime: start,
          endTime: end,
          topic,
          clientName,
          status: "confirmed",
        },
      });

      await sendText(
        advisor.whatsappNumber,
        `📅 Neuer Termin gebucht!\nKunde: ${clientName}\nThema: ${topic}\nZeit: ${start.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}`
      );

      return { appointmentId: appointment.id, status: "confirmed", startISO: start.toISOString() };
    }

    case "send_form_link": {
      const { formType } = input as { formType: string };
      const token = crypto.randomBytes(16).toString("hex");
      await db.formSubmission.create({ data: { token, conversationId, formType } });
      return { url: `${process.env.PUBLIC_BASE_URL}/forms/${token}` };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
