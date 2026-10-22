// Ready check: what must be true before a live demo. Pure: the facts are gathered by
// readyCheckRun.ts; this only decides ✅/❌ per row. Rows appear in this order.
import type { HealthStatus } from "./api";

export const READY_CHECK_IDS = [
  "server",
  "parse",
  "mic",
  "contacts",
  "tts",
  "upiApp",
  "payees",
  "history",
  "limit",
  "rehearsalOff",
  "rehearsalEntries",
  "notifications", // reminders (M13) ring only with notifications allowed
  "helper", // the "Call …" button (M17) needs a family helper
] as const;
export type ReadyCheckId = (typeof READY_CHECK_IDS)[number];

export type PermissionState = "granted" | "denied" | "undetermined";

export type ReadyFacts = {
  health: HealthStatus;
  // The fixed probe "Mummy ko paanch sau bhejo" → 50000 paise. "skipped" when the server is down.
  parse: "ok" | "wrong" | "failed" | "skipped";
  mic: PermissionState | "unavailable"; // unavailable = no in-app mic (e.g. Expo Go)
  contacts: PermissionState;
  ttsEnIn: boolean; // an en-IN text-to-speech voice is installed
  upiApp: boolean; // some app can open upi:// links
  payees: number;
  historyReadable: boolean;
  remainingPaise: number; // left under today's limit
  rehearsalOn: boolean;
  rehearsalEntries: number; // "RH" payments still in history
  notifications: PermissionState | "unavailable"; // unavailable = a build without expo-notifications
  helperSaved: boolean;
};

// remainingPaise is shown as a detail on the limit row (formatted by the screen).
export type ReadyRow = { id: ReadyCheckId; ok: boolean };

export function readyRows(f: ReadyFacts): ReadyRow[] {
  const ok: Record<ReadyCheckId, boolean> = {
    server: f.health === "ok",
    parse: f.parse === "ok",
    mic: f.mic === "granted",
    // A permission pop-up in the middle of a demo is the problem, not the answer itself.
    contacts: f.contacts !== "undetermined",
    tts: f.ttsEnIn,
    upiApp: f.upiApp,
    payees: f.payees > 0,
    history: f.historyReadable,
    limit: f.remainingPaise > 0,
    rehearsalOff: !f.rehearsalOn,
    rehearsalEntries: f.rehearsalEntries === 0,
    notifications: f.notifications === "granted",
    helper: f.helperSaved,
  };
  return READY_CHECK_IDS.map((id) => ({ id, ok: ok[id] }));
}

export const allReady = (rows: ReadyRow[]) => rows.every((r) => r.ok);
