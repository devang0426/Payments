// Payment guardrails. Pure: no React/Expo imports. Money is integer paise.
import type { HistoryEntry, PaymentStatus } from "./history";
import type { Payee } from "./payees";

export const PER_PAYMENT_LIMIT_PAISE = 300000; // ₹3,000
export const DAILY_LIMIT_PAISE = 500000; // ₹5,000 per IST calendar day
// For 24 h after a payee is saved or gets a new UPI ID, at most ₹500 per payment. A payee someone
// added (or redirected) on this phone can't receive much before the owner notices.
export const NEW_PAYEE_LIMIT_PAISE = 50000; // ₹500
export const NEW_PAYEE_PERIOD_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

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

// Is this payee still "new" (saved, or given its current UPI ID, less than 24 h ago)? The later of
// the two times counts. A time in the future (phone clock moved back) counts as new: the safe side.
export function newPayeeStatus(
  payee: Pick<Payee, "addedAt" | "vpaChangedAt">,
  now: number,
): { kind: "added" | "vpaChanged"; msLeft: number } | null {
  const kind = payee.vpaChangedAt > payee.addedAt ? "vpaChanged" : "added";
  const since = Math.max(payee.addedAt, payee.vpaChangedAt);
  const msLeft = Math.min(NEW_PAYEE_PERIOD_MS, since + NEW_PAYEE_PERIOD_MS - now);
  return msLeft > 0 ? { kind, msLeft } : null;
}

// Whole hours, rounded up, so a payee that is still new never shows "0 hours".
export const cooldownHoursLeft = (msLeft: number) => Math.ceil(msLeft / HOUR_MS);

export type RuleFailure =
  | "NO_PAYEE"
  | "ZERO"
  | "INVALID_AMOUNT"
  | "OVER_PER_PAYMENT"
  | "NEW_PAYEE_LIMIT"
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
  if (p.amountPaise > NEW_PAYEE_LIMIT_PAISE && newPayeeStatus(p.payee, p.now)) {
    return { ok: false, reason: "NEW_PAYEE_LIMIT" };
  }
  if (p.historyUnreadable) return { ok: false, reason: "HISTORY_UNREADABLE" };
  if (sentTodayPaise(p.history, p.now) + p.amountPaise > DAILY_LIMIT_PAISE) {
    return { ok: false, reason: "OVER_DAILY" };
  }
  return { ok: true };
}

// Unusual payments (M13) make an AMBER card: allowed, but confirming needs a second yes or the tap
// "Yes, I'm sure". Only successful payments count as "paid before". Fixed order.
export type PaymentWarning = "FIRST_PAYMENT" | "UNUSUAL_AMOUNT" | "LATE_NIGHT";
export const UNUSUAL_FACTOR = 3;

// 23:00–04:59 IST.
function isLateNight(now: number): boolean {
  const hour = new Date(now + IST_OFFSET_MS).getUTCHours();
  return hour >= 23 || hour < 5;
}

export function paymentWarnings(p: { payeeId: string; amountPaise: number; history: HistoryEntry[]; now: number }): PaymentWarning[] {
  const paid = p.history
    .filter((e) => e.payeeId === p.payeeId && e.status === "success")
    .map((e) => e.amountPaise)
    .sort((a, b) => a - b);
  const warnings: PaymentWarning[] = [];
  if (paid.length === 0) warnings.push("FIRST_PAYMENT");
  else {
    // amount > 3 × median, in whole numbers: the median of an even count is (a + b) / 2, so compare
    // 2 × amount with 3 × (a + b).
    const mid = Math.floor(paid.length / 2);
    const twiceMedian = paid.length % 2 ? 2 * paid[mid]! : paid[mid - 1]! + paid[mid]!;
    if (2 * p.amountPaise > UNUSUAL_FACTOR * twiceMedian) warnings.push("UNUSUAL_AMOUNT");
  }
  if (isLateNight(p.now)) warnings.push("LATE_NIGHT");
  return warnings;
}

export type CardTone = "green" | "amber" | "red";

export function cardTone(rule: RuleResult, warnings: PaymentWarning[]): CardTone {
  if (!rule.ok) return "red";
  return warnings.length > 0 ? "amber" : "green";
}

// Over the daily limit (M13): offer what's left today, in whole rupees, at least ₹1. Computed by the
// phone; a yes opens a NEW card for it, which runs the rules and asks again. Other red reasons: none.
export function dailyOfferPaise(p: { rule: RuleResult; history: HistoryEntry[]; now: number }): number | null {
  if (p.rule.ok || p.rule.reason !== "OVER_DAILY") return null;
  const left = DAILY_LIMIT_PAISE - sentTodayPaise(p.history, p.now);
  const wholeRupees = Math.floor(left / 100) * 100;
  return wholeRupees >= 100 ? wholeRupees : null;
}
