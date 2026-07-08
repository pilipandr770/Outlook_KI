import { Client } from "@microsoft/microsoft-graph-client";
import { db } from "../db";
import { encrypt, decrypt } from "../security/crypto";
import { getAccessTokenFromRefreshToken } from "./msal";

async function clientForAdvisor(advisorId: string): Promise<Client> {
  const advisor = await db.advisor.findUniqueOrThrow({ where: { id: advisorId } });
  if (!advisor.calendarRefreshToken) {
    throw new Error(`Advisor ${advisor.name} has not connected their Outlook calendar yet`);
  }

  const { accessToken, refreshToken } = await getAccessTokenFromRefreshToken(decrypt(advisor.calendarRefreshToken));
  await db.advisor.update({
    where: { id: advisorId },
    data: { calendarRefreshToken: encrypt(refreshToken) },
  });

  return Client.init({ authProvider: (done) => done(null, accessToken) });
}

export interface BusySlot {
  start: string;
  end: string;
}

export async function getBusySlots(advisorId: string, startISO: string, endISO: string): Promise<BusySlot[]> {
  const client = await clientForAdvisor(advisorId);
  const advisor = await db.advisor.findUniqueOrThrow({ where: { id: advisorId } });

  const result = await client.api("/me/calendar/getSchedule").post({
    schedules: [advisor.calendarUpn],
    startTime: { dateTime: startISO, timeZone: "Europe/Berlin" },
    endTime: { dateTime: endISO, timeZone: "Europe/Berlin" },
    availabilityViewInterval: 30,
  });

  const items = result.value?.[0]?.scheduleItems ?? [];
  return items.map((item: { start: { dateTime: string }; end: { dateTime: string } }) => ({
    start: item.start.dateTime,
    end: item.end.dateTime,
  }));
}

export async function createCalendarEvent(
  advisorId: string,
  params: { subject: string; startISO: string; endISO: string; body: string }
): Promise<string> {
  const client = await clientForAdvisor(advisorId);

  const event = await client.api("/me/events").post({
    subject: params.subject,
    body: { contentType: "text", content: params.body },
    start: { dateTime: params.startISO, timeZone: "Europe/Berlin" },
    end: { dateTime: params.endISO, timeZone: "Europe/Berlin" },
  });

  return event.id as string;
}
