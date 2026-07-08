import { useEffect, useState } from "react";
import { Advisor, createAdvisor, deleteAdvisor, getCalendarAuthUrl, listAdvisors, logout, updateAdvisor } from "./api";

export function AdvisorsPage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", directions: "", whatsappNumber: "" });

  async function refresh() {
    try {
      setAdvisors(await listAdvisors());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load advisors");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.whatsappNumber) return;
    await createAdvisor(form);
    setForm({ name: "", directions: "", whatsappNumber: "" });
    refresh();
  }

  async function handleToggleActive(a: Advisor) {
    await updateAdvisor(a.id, { active: !a.active });
    refresh();
  }

  async function handleDelete(a: Advisor) {
    if (!confirm(`Berater "${a.name}" wirklich löschen?`)) return;
    await deleteAdvisor(a.id);
    refresh();
  }

  async function handleConnectCalendar(a: Advisor) {
    const { url } = await getCalendarAuthUrl(a.id);
    window.open(url, "_blank", "width=500,height=700");
  }

  return (
    <div className="page">
      <div className="row">
        <h1>Berater</h1>
        <button
          className="secondary"
          onClick={() => {
            logout();
            onLoggedOut();
          }}
        >
          Abmelden
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <form className="card inline" onSubmit={handleCreate}>
        <label>Name</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <label>Richtung / Spezialisierung</label>
        <input value={form.directions} onChange={(e) => setForm({ ...form, directions: e.target.value })} />
        <label>WhatsApp-Nummer (für Benachrichtigungen)</label>
        <input
          placeholder="+49..."
          value={form.whatsappNumber}
          onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })}
        />
        <div style={{ marginTop: "1rem" }}>
          <button type="submit">Berater hinzufügen</button>
        </div>
      </form>

      {advisors.map((a) => (
        <div className="card" key={a.id}>
          <div className="row">
            <div>
              <strong>{a.name}</strong>{" "}
              <span className={`badge ${a.calendarConnected ? "connected" : "pending"}`}>
                {a.calendarConnected ? `Kalender verbunden (${a.calendarUpn})` : "Kalender nicht verbunden"}
              </span>
              <p style={{ margin: "0.25rem 0", color: "#555" }}>{a.directions}</p>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#777" }}>{a.whatsappNumber}</p>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {!a.calendarConnected && <button onClick={() => handleConnectCalendar(a)}>Outlook verbinden</button>}
              <button className="secondary" onClick={() => handleToggleActive(a)}>
                {a.active ? "Deaktivieren" : "Aktivieren"}
              </button>
              <button className="danger" onClick={() => handleDelete(a)}>
                Löschen
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
