import { DAILY_LIMIT_PAISE, PER_PAYMENT_LIMIT_PAISE, checkPayment, istDayKey, sentTodayPaise } from "../rules";
import { MUMMY, entry, ist } from "./fixtures";

const NOW = ist("2026-10-15T15:00:00");

describe("limits", () => {
  it("are ₹3,000 per payment and ₹5,000 per day, in paise", () => {
    expect(PER_PAYMENT_LIMIT_PAISE).toBe(300000);
    expect(DAILY_LIMIT_PAISE).toBe(500000);
  });
});

describe("istDayKey (fixed UTC+05:30)", () => {
  it.each([
    ["2026-10-15T18:29:00Z", "2026-10-15"], // 23:59 IST
    ["2026-10-15T18:31:00Z", "2026-10-16"], // 00:01 IST next day
    ["2026-10-14T18:30:00Z", "2026-10-15"], // exactly midnight IST
    ["2026-10-15T00:00:00Z", "2026-10-15"], // 05:30 IST
    ["2026-12-31T19:00:00Z", "2027-01-01"], // year change in IST
  ])("%s → %s", (utc, day) => {
    expect(istDayKey(Date.parse(utc))).toBe(day);
  });
});

describe("checkPayment: single payment", () => {
  const ok = (amountPaise: number) => checkPayment({ amountPaise, payee: MUMMY, history: [], now: NOW });

  it("allows exactly ₹3,000", () => {
    expect(ok(300000)).toEqual({ ok: true });
  });

  it("blocks ₹3,000.01", () => {
    expect(ok(300001)).toEqual({ ok: false, reason: "OVER_PER_PAYMENT" });
  });

  it("allows ₹1", () => {
    expect(ok(100)).toEqual({ ok: true });
  });

  it.each([[0], [-100]])("blocks %i paise as ZERO", (amountPaise) => {
    expect(ok(amountPaise)).toEqual({ ok: false, reason: "ZERO" });
  });

  it.each([[100.5], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    "blocks non-integer paise %p as INVALID_AMOUNT",
    (amountPaise) => {
      expect(ok(amountPaise)).toEqual({ ok: false, reason: "INVALID_AMOUNT" });
    },
  );

  it("blocks when there is no payee", () => {
    expect(checkPayment({ amountPaise: 100, payee: null, history: [], now: NOW })).toEqual({
      ok: false,
      reason: "NO_PAYEE",
    });
  });

  it("checks the payee before the amount", () => {
    expect(checkPayment({ amountPaise: 999999, payee: undefined, history: [], now: NOW })).toEqual({
      ok: false,
      reason: "NO_PAYEE",
    });
  });
});

describe("checkPayment: daily limit", () => {
  const check = (amountPaise: number, history = [entry()]) =>
    checkPayment({ amountPaise, payee: MUMMY, history, now: NOW });

  it("allows reaching exactly ₹5,000 for the day", () => {
    const history = [entry({ amountPaise: 300000 }), entry({ id: "h-2", txnRef: "FP2", amountPaise: 150000 })];
    expect(check(50000, history)).toEqual({ ok: true });
  });

  it("blocks going 1 paisa over ₹5,000", () => {
    const history = [entry({ amountPaise: 300000 }), entry({ id: "h-2", txnRef: "FP2", amountPaise: 150000 })];
    expect(check(50001, history)).toEqual({ ok: false, reason: "OVER_DAILY" });
  });

  it.each([["success"], ["pending"], ["unknown"]] as const)("counts %s payments", (status) => {
    expect(check(100, [entry({ amountPaise: 499950, status })])).toEqual({ ok: false, reason: "OVER_DAILY" });
  });

  it("does not count failed payments", () => {
    expect(check(300000, [entry({ amountPaise: 499900, status: "failed" })])).toEqual({ ok: true });
  });

  it("does not count yesterday (23:59 IST) when it is now 00:01 IST", () => {
    const history = [entry({ amountPaise: 499900, createdAt: ist("2026-10-14T23:59:00") })];
    expect(
      checkPayment({ amountPaise: 300000, payee: MUMMY, history, now: ist("2026-10-15T00:01:00") }),
    ).toEqual({ ok: true });
  });

  it("counts 00:01 IST today when it is now 23:59 IST", () => {
    const history = [entry({ amountPaise: 499900, createdAt: ist("2026-10-15T00:01:00") })];
    expect(
      checkPayment({ amountPaise: 200, payee: MUMMY, history, now: ist("2026-10-15T23:59:00") }),
    ).toEqual({ ok: false, reason: "OVER_DAILY" });
  });

  it("counts payments to every payee, not just this one", () => {
    const history = [entry({ payeeId: "someone-else", amountPaise: 499900 })];
    expect(check(200, history)).toEqual({ ok: false, reason: "OVER_DAILY" });
  });

  it("blocks every payment while the history is unreadable (today's total is unknown)", () => {
    expect(
      checkPayment({ amountPaise: 100, payee: MUMMY, history: [], now: NOW, historyUnreadable: true }),
    ).toEqual({ ok: false, reason: "HISTORY_UNREADABLE" });
  });

  it("reports the per-payment limit before the daily limit", () => {
    expect(check(300001, [entry({ amountPaise: 499900 })])).toEqual({ ok: false, reason: "OVER_PER_PAYMENT" });
  });
});

describe("sentTodayPaise", () => {
  it("sums today's success, pending and unknown payments in IST", () => {
    const history = [
      entry({ id: "a", txnRef: "A", amountPaise: 100, status: "success" }),
      entry({ id: "b", txnRef: "B", amountPaise: 200, status: "pending" }),
      entry({ id: "c", txnRef: "C", amountPaise: 400, status: "unknown" }),
      entry({ id: "d", txnRef: "D", amountPaise: 800, status: "failed" }),
      entry({ id: "e", txnRef: "E", amountPaise: 1600, createdAt: ist("2026-10-14T23:00:00") }),
    ];
    expect(sentTodayPaise(history, NOW)).toBe(700);
  });
});
