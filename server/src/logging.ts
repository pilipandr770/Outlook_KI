import axios from "axios";

// Axios attaches the full request config (including default headers like our Evolution API
// key) to thrown errors. `console.error(msg, err)` on that object prints it in full — verified
// this actually happens with this project's axios version, not just in theory. Never pass a raw
// caught error to console.error; go through here so secrets can't leak into log output.
export function logError(context: string, err: unknown): void {
  if (axios.isAxiosError(err)) {
    console.error(`${context}: ${err.response?.status ?? "no response"} ${err.message}`);
    return;
  }
  if (err instanceof Error) {
    console.error(`${context}: ${err.stack ?? err.message}`);
    return;
  }
  console.error(`${context}:`, err);
}
