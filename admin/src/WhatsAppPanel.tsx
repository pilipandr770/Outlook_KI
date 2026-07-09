import { useEffect, useRef, useState } from "react";
import { WhatsAppStatus, connectWhatsApp, disconnectWhatsApp, getWhatsAppStatus } from "./api";

export function WhatsAppPanel() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<number | null>(null);

  async function refreshStatus() {
    try {
      const s = await getWhatsAppStatus();
      setStatus(s);
      if (s.connectionStatus === "open") {
        setQr(null);
        stopPolling();
      }
      return s;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status konnte nicht geladen werden");
      return null;
    }
  }

  function stopPolling() {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => {
    refreshStatus();
    return stopPolling;
  }, []);

  async function handleConnect() {
    setBusy(true);
    setError(null);
    try {
      const { base64 } = await connectWhatsApp();
      if (base64) {
        setQr(base64);
        stopPolling();
        pollRef.current = window.setInterval(refreshStatus, 3000);
      } else {
        await refreshStatus();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verbindung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("WhatsApp-Verbindung wirklich trennen? Der Assistent kann dann keine Nachrichten mehr empfangen oder senden.")) return;
    setBusy(true);
    setError(null);
    try {
      await disconnectWhatsApp();
      setQr(null);
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trennen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  const connected = status?.connectionStatus === "open";

  return (
    <div className="card">
      <div className="row">
        <h2 style={{ margin: 0 }}>WhatsApp-Verbindung</h2>
        {status && (
          <span className={`badge ${connected ? "connected" : "pending"}`}>
            {connected ? `✅ Verbunden${status.ownerNumber ? ` (+${status.ownerNumber})` : ""}` : "⚠️ Nicht verbunden"}
          </span>
        )}
      </div>

      <p style={{ color: "#555", fontSize: "0.9rem" }}>
        Verbinde hier die WhatsApp-Nummer, die als Kompass-Frankfurt-Assistent antworten soll. Du brauchst dafür kein separates
        Werkzeug — alles läuft über diese Seite.
      </p>

      {error && <p className="error">{error}</p>}

      {!connected && !qr && (
        <div>
          <p style={{ color: "#555", fontSize: "0.9rem" }}>
            Klicke auf „QR-Code anzeigen", scanne ihn danach mit der WhatsApp-App der gewünschten Nummer: <br />
            <strong>WhatsApp → Einstellungen → Verknüpfte Geräte → Gerät verknüpfen</strong>.
          </p>
          <button onClick={handleConnect} disabled={busy}>
            {busy ? "..." : "QR-Code anzeigen"}
          </button>
        </div>
      )}

      {!connected && qr && (
        <div>
          <p style={{ color: "#555", fontSize: "0.9rem" }}>
            Scanne jetzt diesen Code mit WhatsApp (Einstellungen → Verknüpfte Geräte → Gerät verknüpfen). Diese Seite aktualisiert
            sich automatisch, sobald die Verbindung erfolgreich war.
          </p>
          <img src={qr} alt="WhatsApp QR-Code" style={{ width: 240, height: 240, border: "1px solid #ddd", borderRadius: 8 }} />
          <div style={{ marginTop: "0.75rem" }}>
            <button className="secondary" onClick={handleConnect} disabled={busy}>
              {busy ? "..." : "QR-Code neu laden"}
            </button>
          </div>
        </div>
      )}

      {connected && (
        <button className="danger" onClick={handleDisconnect} disabled={busy}>
          {busy ? "..." : "Verbindung trennen"}
        </button>
      )}
    </div>
  );
}
