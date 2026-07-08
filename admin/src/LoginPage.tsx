import { useState } from "react";
import { login } from "./api";

export function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username, password);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>Kompass Assistant — Admin-Anmeldung</h1>
      <form className="card inline" onSubmit={handleSubmit}>
        <label>Benutzername</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <label>Passwort</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="error">{error}</p>}
        <div style={{ marginTop: "1rem" }}>
          <button type="submit" disabled={busy}>
            {busy ? "..." : "Anmelden"}
          </button>
        </div>
      </form>
    </div>
  );
}
