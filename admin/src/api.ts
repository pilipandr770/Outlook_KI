const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

function getToken(): string | null {
  return localStorage.getItem("adminToken");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Anfrage fehlgeschlagen: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface Advisor {
  id: string;
  name: string;
  directions: string;
  whatsappNumber: string;
  active: boolean;
  calendarConnected: boolean;
  calendarUpn: string | null;
}

export async function login(username: string, password: string): Promise<void> {
  const { token } = await request<{ token: string }>("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  localStorage.setItem("adminToken", token);
}

export function logout(): void {
  localStorage.removeItem("adminToken");
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export const listAdvisors = () => request<Advisor[]>("/admin/api/advisors");

export const createAdvisor = (data: Pick<Advisor, "name" | "directions" | "whatsappNumber">) =>
  request<Advisor>("/admin/api/advisors", { method: "POST", body: JSON.stringify(data) });

export const updateAdvisor = (id: string, data: Partial<Advisor>) =>
  request<Advisor>(`/admin/api/advisors/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const deleteAdvisor = (id: string) => request<void>(`/admin/api/advisors/${id}`, { method: "DELETE" });

export const getCalendarAuthUrl = (id: string) => request<{ url: string }>(`/admin/api/advisors/${id}/calendar-auth-url`);

export interface WhatsAppStatus {
  exists: boolean;
  connectionStatus: "open" | "connecting" | "close" | "unknown";
  ownerNumber: string | null;
}

export const getWhatsAppStatus = () => request<WhatsAppStatus>("/admin/api/whatsapp/status");

export const connectWhatsApp = () => request<{ base64: string | null }>("/admin/api/whatsapp/connect", { method: "POST" });

export const disconnectWhatsApp = () => request<void>("/admin/api/whatsapp/disconnect", { method: "POST" });

export type AiProvider = "anthropic" | "mistral" | "openai";

export const getSettings = () => request<{ aiProvider: AiProvider }>("/admin/api/settings");

export const updateSettings = (aiProvider: AiProvider) =>
  request<{ aiProvider: AiProvider }>("/admin/api/settings", { method: "PUT", body: JSON.stringify({ aiProvider }) });
