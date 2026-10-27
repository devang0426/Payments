import {
  DAILY_LIMIT_PAISE,
  NEW_PAYEE_LIMIT_PAISE,
  NEW_PAYEE_PERIOD_MS,
  PER_PAYMENT_LIMIT_PAISE,
  cardTone,
  checkPayment,
  cooldownHoursLeft,
  dailyOfferPaise,
  istDayKey,
  newPayeeStatus,
  paymentWarnings,
  sentTodayPaise,
  type PaymentWarning,
} from "../rules";
import { MUMMY, PAPA, entry, ist } from "./fixtures";

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

const HOUR = 60 * 60 * 1000;
const WEEK_AGO = NOW - 7 * 24 * HOUR;
// MUMMY, but saved (addedAt) and/or given her current UPI ID (vpaChangedAt) at these times.
const savedAt = (addedAt: number, vpaChangedAt = addedAt) => ({ ...MUMMY, addedAt, vpaChangedAt });

describe("new or changed payee: ₹500 cap for 24 h", () => {
  const check = (payee: ReturnType<typeof savedAt>, amountPaise: number, history: ReturnType<typeof entry>[] = []) =>
    checkPayment({ amountPaise, payee, history, now: NOW });

  it("limits are ₹500 for 24 hours, in paise / ms", () => {
    expect(NEW_PAYEE_LIMIT_PAISE).toBe(50000);
    expect(NEW_PAYEE_PERIOD_MS).toBe(24 * HOUR);
  });

  it("payee added 1 h ago: exactly ₹500 is allowed", () => {
    expect(check(savedAt(NOW - HOUR), 50000)).toEqual({ ok: true });
  });

  it("payee added 1 h ago: ₹500.01 is blocked", () => {
    expect(check(savedAt(NOW - HOUR), 50001)).toEqual({ ok: false, reason: "NEW_PAYEE_LIMIT" });
  });

  it("old payee whose UPI ID changed 1 h ago: ₹501 is blocked", () => {
    expect(check(savedAt(WEEK_AGO, NOW - HOUR), 50100)).toEqual({ ok: false, reason: "NEW_PAYEE_LIMIT" });
  });

  it("1 ms before 24 h is still new", () => {
    expect(check(savedAt(NOW - NEW_PAYEE_PERIOD_MS + 1), 50001)).toEqual({ ok: false, reason: "NEW_PAYEE_LIMIT" });
  });

  it("exactly 24 h later the normal ₹3,000 limit applies", () => {
    expect(check(savedAt(NOW - NEW_PAYEE_PERIOD_MS), 300000)).toEqual({ ok: true });
  });

  it("a timestamp in the future (phone clock moved back) counts as new: the safe side", () => {
    expect(check(savedAt(NOW + 5 * HOUR), 50001)).toEqual({ ok: false, reason: "NEW_PAYEE_LIMIT" });
  });

  it("over ₹3,000 still reports the per-payment limit first", () => {
    expect(check(savedAt(NOW - HOUR), 300001)).toEqual({ ok: false, reason: "OVER_PER_PAYMENT" });
  });

  it("an allowed amount to a new payee still meets the other rules (unreadable history)", () => {
    expect(
      checkPayment({ amountPaise: 100, payee: savedAt(NOW - HOUR), history: [], now: NOW, historyUnreadable: true }),
    ).toEqual({ ok: false, reason: "HISTORY_UNREADABLE" });
  });

  it("an allowed amount to a new payee still meets the other rules (daily limit)", () => {
    expect(check(savedAt(NOW - HOUR), 40000, [entry({ amountPaise: 470000 })])).toEqual({
      ok: false,
      reason: "OVER_DAILY",
    });
  });

  it("zero and invalid amounts are reported as before, not as NEW_PAYEE_LIMIT", () => {
    expect(check(savedAt(NOW - HOUR), 0)).toEqual({ ok: false, reason: "ZERO" });
    expect(check(savedAt(NOW - HOUR), 1.5)).toEqual({ ok: false, reason: "INVALID_AMOUNT" });
  });
});

describe("newPayeeStatus (for the Confirm card badge and the hours left)", () => {
  it("an old payee → null", () => {
    expect(newPayeeStatus(savedAt(WEEK_AGO), NOW)).toBeNull();
  });

  it("added 2 h ago → added, 22 h left", () => {
    expect(newPayeeStatus(savedAt(NOW - 2 * HOUR), NOW)).toEqual({ kind: "added", msLeft: 22 * HOUR });
  });

  it("added a week ago, UPI ID changed 30 min ago → vpaChanged, 23.5 h left", () => {
    expect(newPayeeStatus(savedAt(WEEK_AGO, NOW - HOUR / 2), NOW)).toEqual({ kind: "vpaChanged", msLeft: 23.5 * HOUR });
  });

  it("a brand-new payee (both timestamps equal) → added", () => {
    expect(newPayeeStatus(savedAt(NOW - HOUR), NOW)?.kind).toBe("added");
  });

  it("a future timestamp → new, with at most 24 h left", () => {
    expect(newPayeeStatus(savedAt(NOW + 5 * HOUR), NOW)).toEqual({ kind: "added", msLeft: NEW_PAYEE_PERIOD_MS });
  });

  it("exactly 24 h later → null", () => {
    expect(newPayeeStatus(savedAt(NOW - NEW_PAYEE_PERIOD_MS), NOW)).toBeNull();
  });
});

describe("cooldownHoursLeft (rounded up, never shows 0 while still new)", () => {
  it.each([
    [22 * HOUR, 22],
    [22 * HOUR + 1, 23],
    [1, 1],
    [NEW_PAYEE_PERIOD_MS, 24],
  ])("%i ms → %i h", (ms, hours) => {
    expect(cooldownHoursLeft(ms)).toBe(hours);
  });
});

// M13: unusual payments make an AMBER card (allowed, but confirming needs a second yes or the tap
// "Yes, I'm sure"). Code, not AI. Only successful payments count as "paid before".
describe("paymentWarnings (amber)", () => {
  const AFTERNOON = ist("2026-10-15T15:00:00");
  const paid = (amountPaise: number, i: number, over = {}) =>
    entry({ id: `h${i}`, txnRef: `FP${i}`, payeeId: MUMMY.id, amountPaise, createdAt: ist("2026-10-01T12:00:00") + i, ...over });
  const warn = (amountPaise: number, history = [paid(50000, 1)], now = AFTERNOON) =>
    paymentWarnings({ payeeId: MUMMY.id, amountPaise, history, now });

  it("a normal payment → no warnings", () => {
    expect(warn(50000)).toEqual([]);
  });

  it("first payment to this payee → FIRST_PAYMENT", () => {
    expect(warn(50000, [])).toEqual(["FIRST_PAYMENT"]);
  });

  it("payments to someone else don't count", () => {
    expect(warn(50000, [paid(50000, 1, { payeeId: PAPA.id })])).toEqual(["FIRST_PAYMENT"]);
  });

  it.each([["failed"], ["pending"], ["unknown"]] as const)("only a %s payment before → still FIRST_PAYMENT", (status) => {
    expect(warn(50000, [paid(50000, 1, { status })])).toEqual(["FIRST_PAYMENT"]);
  });

  describe("more than 3× the median of earlier payments to this payee", () => {
    const history = [paid(20000, 1), paid(50000, 2), paid(100000, 3)]; // median ₹500

    it("exactly 3× (₹1,500) → no warning", () => {
      expect(warn(150000, history)).toEqual([]);
    });

    it("₹1,500.01 → UNUSUAL_AMOUNT", () => {
      expect(warn(150001, history)).toEqual(["UNUSUAL_AMOUNT"]);
    });

    it("an even number of payments: median is the mean of the middle two (₹300 and ₹500 → ₹400)", () => {
      const even = [paid(10000, 1), paid(30000, 2), paid(50000, 3), paid(200000, 4)];
      expect(warn(120000, even)).toEqual([]); // exactly 3 × ₹400
      expect(warn(120001, even)).toEqual(["UNUSUAL_AMOUNT"]);
    });

    it("an odd median in paise doesn't cause rounding: ₹1.01 and ₹1.02 → median 101.5 paise", () => {
      const tiny = [paid(101, 1), paid(102, 2)];
      expect(warn(304, tiny)).toEqual([]); // 304 < 304.5
      expect(warn(305, tiny)).toEqual(["UNUSUAL_AMOUNT"]);
    });

    it("failed payments are not part of the median", () => {
      expect(warn(150001, [...history, paid(1000000, 9, { status: "failed" })])).toEqual(["UNUSUAL_AMOUNT"]);
    });
  });

  describe("late at night: 23:00–05:00 IST", () => {
    it.each([
      ["2026-10-15T22:59:59", []],
      ["2026-10-15T23:00:00", ["LATE_NIGHT"]],
      ["2026-10-16T02:30:00", ["LATE_NIGHT"]],
      ["2026-10-16T04:59:59", ["LATE_NIGHT"]],
      ["2026-10-16T05:00:00", []],
    ])("%s → %j", (time, expected) => {
      expect(warn(50000, undefined, ist(time))).toEqual(expected);
    });

    it("IST, not UTC: 23:30 IST is 18:00 UTC", () => {
      expect(warn(50000, undefined, Date.parse("2026-10-15T18:00:00Z"))).toEqual(["LATE_NIGHT"]);
    });
  });

  it("several warnings together, in a fixed order", () => {
    expect(warn(50000, [], ist("2026-10-15T23:30:00"))).toEqual(["FIRST_PAYMENT", "LATE_NIGHT"]);
    expect(warn(500000, [paid(10000, 1)], ist("2026-10-15T23:30:00"))).toEqual(["UNUSUAL_AMOUNT", "LATE_NIGHT"]);
  });
});

describe("cardTone", () => {
  it("a rule failure is red, whatever the warnings", () => {
    expect(cardTone({ ok: false, reason: "OVER_DAILY" }, ["FIRST_PAYMENT"])).toBe("red");
  });
  it("allowed with a warning → amber", () => {
    expect(cardTone({ ok: true }, ["LATE_NIGHT"])).toBe("amber");
  });
  it("allowed, no warning → green", () => {
    expect(cardTone({ ok: true }, [])).toBe("green");
  });

  // 2026-10-22 (user's choice): "first payment to this person" alone no longer needs a second yes. It is
  // still spoken and shown on the card; the new-payee limit (₹500 for 24 h) still applies.
  it("allowed, only 'first payment to this person' → green: one yes is enough", () => {
    expect(cardTone({ ok: true }, ["FIRST_PAYMENT"])).toBe("green");
  });

  it.each<[PaymentWarning[]]>([[["UNUSUAL_AMOUNT"]], [["LATE_NIGHT"]], [["FIRST_PAYMENT", "LATE_NIGHT"]]])(
    "an unusually large amount or late at night still needs the second yes: %j → amber",
    (warnings) => {
      expect(cardTone({ ok: true }, warnings)).toBe("amber");
    },
  );

  it("a rule failure stays red even with only the first-payment warning", () => {
    expect(cardTone({ ok: false, reason: "NEW_PAYEE_LIMIT" }, ["FIRST_PAYMENT"])).toBe("red");
  });
});

// M13: over the daily limit, the red card offers what's left today ("Send ₹2,000 instead?"),
// computed by the phone. Saying yes opens a NEW card for that amount, which asks again.
describe("dailyOfferPaise (red-card offer)", () => {
  const NOW = ist("2026-10-15T15:00:00");
  const today = (amountPaise: number, i = 1, over = {}) =>
    entry({ id: `t${i}`, txnRef: `FT${i}`, amountPaise, createdAt: ist("2026-10-15T10:00:00") + i, ...over });
  const offer = (amountPaise: number, history: ReturnType<typeof today>[]) => {
    const rule = checkPayment({ amountPaise, payee: MUMMY, history, now: NOW });
    return dailyOfferPaise({ rule, history, now: NOW });
  };

  it("₹2,500 after ₹3,000 today → offer ₹2,000 (AGENT.md example 6)", () => {
    expect(offer(250000, [today(300000)])).toBe(200000);
  });

  it("the offer itself passes the rules (the new card is still checked again)", () => {
    const history = [today(300000)];
    const x = offer(250000, history)!;
    expect(checkPayment({ amountPaise: x, payee: MUMMY, history, now: NOW })).toEqual({ ok: true });
  });

  it("pending and unknown payments count as spent (same as the limit)", () => {
    expect(offer(250000, [today(100000, 1, { status: "pending" }), today(200000, 2, { status: "unknown" })])).toBe(200000);
  });

  it("rounds down to whole rupees: ₹1,999.50 left → offer ₹1,999", () => {
    expect(offer(250000, [today(300050)])).toBe(199900);
  });

  it.each([
    ["nothing left today", [today(300000, 1), today(200000, 2)]],
    ["less than ₹1 left", [today(300000, 1), today(199950, 2)]],
  ])("%s → no offer", (_label, history) => {
    expect(offer(10000, history)).toBeNull();
  });

  it.each([
    ["over ₹3,000 per payment", 300100],
    ["zero", 0],
  ])("no offer for other red reasons (%s)", (_label, amountPaise) => {
    expect(offer(amountPaise, [])).toBeNull();
  });

  it("no offer for a new payee over ₹500, or when history can't be read", () => {
    const fresh = { ...MUMMY, addedAt: NOW - 1000, vpaChangedAt: NOW - 1000 };
    const rule = checkPayment({ amountPaise: 60000, payee: fresh, history: [], now: NOW });
    expect(dailyOfferPaise({ rule, history: [], now: NOW })).toBeNull();
    const unreadable = checkPayment({ amountPaise: 10000, payee: MUMMY, history: [], now: NOW, historyUnreadable: true });
    expect(dailyOfferPaise({ rule: unreadable, history: [], now: NOW })).toBeNull();
  });

  it("a green or amber card has no offer", () => {
    expect(dailyOfferPaise({ rule: { ok: true }, history: [], now: NOW })).toBeNull();
  });
});
