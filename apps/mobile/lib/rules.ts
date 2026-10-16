// Payment guardrails. Pure: no React/Expo imports. Money is integer paise.
import type { HistoryEntry, PaymentStatus } from "./history";
import type { Payee } from "./payees";

export const PER_PAYMENT_LIMIT_PAISE = 300000; // ₹3,000
export const DAILY_LIMIT_PAISE = 500000; // ₹5,000 per IST calendar day

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // India has no DST

// "YYYY-MM-DD" of the IST calendar day for a UTC timestamp.
export function istDayKey(timestampMs: number): string {
  return new Date(timestampMs + IST_OFFSET_MS).toISOString().slice(0, 10);
}

// Err on the safe side: anything that may have moved money counts.
const COUNTS_TOWARD_LIMIT: ReadonlySet<PaymentStatus> = new Set(["success", "pending", "unknown"]);

export function sentTodayPaise(history: HistoryEntry[], now: number): number {
  const today = istDayKey(now);
  return history
    .filter((e) => COUNTS_TOWARD_LIMIT.has(e.status) && istDayKey(e.createdAt) === today)
    .reduce((sum, e) => sum + e.amountPaise, 0);
}

export type RuleFailure =
  | "NO_PAYEE"
  | "ZERO"
  | "INVALID_AMOUNT"
  | "OVER_PER_PAYMENT"
  | "HISTORY_UNREADABLE"
  | "OVER_DAILY";

export type RuleResult = { ok: true } | { ok: false; reason: RuleFailure };

export function checkPayment(p: {
  amountPaise: number;
  payee: Payee | null | undefined;
  history: HistoryEntry[];
  now: number;
  historyUnreadable?: boolean;
}): RuleResult {
  if (!p.payee) return { ok: false, reason: "NO_PAYEE" };
  if (!Number.isFinite(p.amountPaise) || !Number.isInteger(p.amountPaise)) {
    return { ok: false, reason: "INVALID_AMOUNT" };
  }
  if (p.amountPaise <= 0) return { ok: false, reason: "ZERO" };
  if (p.amountPaise > PER_PAYMENT_LIMIT_PAISE) return { ok: false, reason: "OVER_PER_PAYMENT" };
  if (p.historyUnreadable) return { ok: false, reason: "HISTORY_UNREADABLE" };
  if (sentTodayPaise(p.history, p.now) + p.amountPaise > DAILY_LIMIT_PAISE) {
    return { ok: false, reason: "OVER_DAILY" };
  }
  return { ok: true };
}
