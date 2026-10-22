// show_spending (M13): the server sends only a period name; the phone works out the IST range and adds
// up its own history. The total is shown (and maybe spoken) by the phone and never goes back to the
// server or the AI. Pure. Money is integer paise.
import { formatRupees } from "./format";
import type { HistoryEntry } from "./history";

export type Period = "today" | "yesterday" | "this_week" | "this_month" | "last_month" | "all";

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // India has no DST
const DAY_MS = 24 * 60 * 60 * 1000;

// 00:00 IST of a calendar date (month may overflow: Date.UTC handles it).
const istMidnight = (y: number, m: number, d: number) => Date.UTC(y, m, d) - IST_OFFSET_MS;

// [fromMs, toMs) in IST. Weeks start on Monday.
export function periodRange(period: Period, now: number): { fromMs: number; toMs: number } {
  const ist = new Date(now + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const d = ist.getUTCDate();
  const today = istMidnight(y, m, d);
  switch (period) {
    case "today":
      return { fromMs: today, toMs: today + DAY_MS };
    case "yesterday":
      return { fromMs: today - DAY_MS, toMs: today };
    case "this_week": {
      const sinceMonday = (ist.getUTCDay() + 6) % 7;
      const from = istMidnight(y, m, d - sinceMonday);
      return { fromMs: from, toMs: istMidnight(y, m, d - sinceMonday + 7) };
    }
    case "this_month":
      return { fromMs: istMidnight(y, m, 1), toMs: istMidnight(y, m + 1, 1) };
    case "last_month":
      return { fromMs: istMidnight(y, m - 1, 1), toMs: istMidnight(y, m, 1) };
    case "all":
      return { fromMs: 0, toMs: Number.MAX_SAFE_INTEGER };
  }
}

export type SpendingSummary = { totalPaise: number; count: number; unconfirmedCount: number };

// Only successful payments are added up. Pending/unknown ones are counted separately (shown, never
// added); failed ones are left out.
export function spendingSummary(p: { history: HistoryEntry[]; payeeId?: string; period: Period; now: number }): SpendingSummary {
  const { fromMs, toMs } = periodRange(p.period, p.now);
  const inRange = p.history.filter(
    (e) => (!p.payeeId || e.payeeId === p.payeeId) && e.createdAt >= fromMs && e.createdAt < toMs,
  );
  const paid = inRange.filter((e) => e.status === "success");
  return {
    totalPaise: paid.reduce((sum, e) => sum + e.amountPaise, 0),
    count: paid.length,
    unconfirmedCount: inRange.filter((e) => e.status === "pending" || e.status === "unknown").length,
  };
}

// "₹2,500 in 3 payments (+2 not confirmed)". Built by the phone, never by the AI.
export function spendingLine(s: SpendingSummary): string {
  const main = s.count === 0 ? "No payments" : `${formatRupees(s.totalPaise)} in ${s.count} ${s.count === 1 ? "payment" : "payments"}`;
  return s.unconfirmedCount > 0 ? `${main} (+${s.unconfirmedCount} not confirmed)` : main;
}
