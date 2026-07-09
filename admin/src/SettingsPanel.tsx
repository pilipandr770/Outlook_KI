import { useEffect, useState } from "react";
import { AiProvider, getSettings, updateSettings } from "./api";

const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: "Anthropic (Claude)",
  mistral: "Mistral (EU-gehostet)",
  openai: "OpenAI (GPT)",
};

export function SettingsPanel() {
  const [provider, setProvider] = useState<AiProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSettings()
      .then((s) => setProvider(s.aiProvider))
      .catch((err) => setError(err instanceof Error ? err.message : "Einstellungen konnten nicht geladen werden"));
  }, []);

  async function handleChange(next: AiProvider) {
    setBusy(true);
    setError(null);
    try {
      await updateSettings(next);
      setProvider(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>KI-Modell</h2>
      <p style={{ color: "#555", fontSize: "0.9rem" }}>
        Welcher Anbieter die Antworten des Assistenten generiert. Die Umstellung wirkt sofort auf alle künftigen
        Chat-Nachrichten, ohne Neustart.
      </p>
      {error && <p className="error">{error}</p>}
      {provider && (
        <select
          value={provider}
          disabled={busy}
          onChange={(e) => handleChange(e.target.value as AiProvider)}
          style={{ maxWidth: 320 }}
        >
          {(Object.keys(PROVIDER_LABELS) as AiProvider[]).map((key) => (
            <option key={key} value={key}>
              {PROVIDER_LABELS[key]}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
