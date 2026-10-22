// M13 reminders. The server sends a fixed "when" ({ kind: "dayOfMonth", day: 1 }, …) parsed by code;
// the phone works out the IST time, stores the reminder structured (payeeId, paise, when: never the
// user's words), and when it rings opens a normal Confirm card. A reminder never pays on its own.
import {
  MAX_REMINDERS,
  REMINDER_HOUR_IST,
  catchUp,
  createReminderStore,
  nextAfterFired,
  nextReminderAt,
  notificationFor,
  reminderPayment,
  suggestMonthlyReminder,
  type Reminder,
} from "../reminders";
import { MUMMY, PAPA, PAYEES, entry, ist, memoryStore } from "./fixtures";

const KEY = "flowpay.reminders.v1";

describe("nextReminderAt: always 9:00 AM IST, always in the future", () => {
  it("rings at 9 AM", () => {
    expect(REMINDER_HOUR_IST).toBe(9);
  });

  it.each([
    ["kal (tomorrow)", { kind: "inDays", days: 1 }, "2026-10-15T23:30:00", "2026-10-16T09:00:00"],
    ["parson", { kind: "inDays", days: 2 }, "2026-10-15T08:00:00", "2026-10-17T09:00:00"],
    ["kal at 00:30 IST (still the day before in UTC)", { kind: "inDays", days: 1 }, "2026-10-16T00:30:00", "2026-10-17T09:00:00"],
    ["the 1st, later this month → next month", { kind: "dayOfMonth", day: 1 }, "2026-10-15T15:00:00", "2026-11-01T09:00:00"],
    ["the 20th, still ahead this month", { kind: "dayOfMonth", day: 20 }, "2026-10-15T15:00:00", "2026-10-20T09:00:00"],
    ["today's date, before 9 AM → today", { kind: "dayOfMonth", day: 15 }, "2026-10-15T08:59:00", "2026-10-15T09:00:00"],
    ["today's date, at 9 AM → next month", { kind: "dayOfMonth", day: 15 }, "2026-10-15T09:00:00", "2026-11-15T09:00:00"],
    ["the 31st in November → 31 December", { kind: "dayOfMonth", day: 31 }, "2026-11-05T10:00:00", "2026-12-31T09:00:00"],
    ["the 30th in February → 30 March", { kind: "dayOfMonth", day: 30 }, "2027-02-10T10:00:00", "2027-03-30T09:00:00"],
    ["the 1st in December → 1 January", { kind: "dayOfMonth", day: 1 }, "2026-12-05T10:00:00", "2027-01-01T09:00:00"],
    ["every month on the 1st", { kind: "monthly", day: 1 }, "2026-10-15T15:00:00", "2026-11-01T09:00:00"],
    ["every month on the 28th, in February", { kind: "monthly", day: 28 }, "2027-02-01T10:00:00", "2027-02-28T09:00:00"],
  ] as const)("%s", (_label, when, now, at) => {
    expect(nextReminderAt(when, ist(now))).toBe(ist(at));
  });
});

describe("nextAfterFired", () => {
  it("a monthly reminder moves to the next month", () => {
    expect(nextAfterFired({ kind: "monthly", day: 1 }, ist("2026-11-01T09:00:00"))).toBe(ist("2026-12-01T09:00:00"));
  });

  it("a late ring (phone was off) still moves to the next month, not the same day again", () => {
    expect(nextAfterFired({ kind: "monthly", day: 1 }, ist("2026-11-03T18:00:00"))).toBe(ist("2026-12-01T09:00:00"));
  });

  it.each([[{ kind: "dayOfMonth", day: 1 }], [{ kind: "inDays", days: 1 }]] as const)("a one-time reminder %j → null", (when) => {
    expect(nextAfterFired(when, ist("2026-11-01T09:00:00"))).toBeNull();
  });
});

describe("reminder store (AsyncStorage, Zod)", () => {
  const NOW = ist("2026-10-15T15:00:00");
  const input = { payeeId: MUMMY.id, amountPaise: 200000, when: { kind: "dayOfMonth", day: 1 } as const, nextAt: ist("2026-11-01T09:00:00") };

  function setup(initial: Record<string, string> = {}) {
    const store = memoryStore(initial);
    let n = 0;
    return { store, reminders: createReminderStore(store, () => `r${++n}`) };
  }

  it("add → list; stores only structured fields (no words, no UPI ID)", async () => {
    const { store, reminders } = setup();
    const added = await reminders.add(input, NOW);
    expect(added).toEqual({ ok: true, reminder: { id: "r1", ...input, createdAt: NOW } });
    expect(await reminders.list()).toEqual([{ id: "r1", ...input, createdAt: NOW }]);
    expect(store.raw.get(KEY)).not.toContain("@");
  });

  it("an amount is optional (asked when it rings)", async () => {
    const { reminders } = setup();
    const { amountPaise: _a, ...noAmount } = input;
    const added = await reminders.add(noAmount, NOW);
    expect(added.ok && added.reminder.amountPaise).toBeUndefined();
  });

  it.each([
    ["fractional paise", { ...input, amountPaise: 100.5 }],
    ["zero paise", { ...input, amountPaise: 0 }],
    ["a time in the past", { ...input, nextAt: NOW - 1 }],
    ["monthly on the 30th", { ...input, when: { kind: "monthly", day: 30 } }],
    ["no payee", { ...input, payeeId: "" }],
  ])("rejects %s", async (_label, bad) => {
    const { reminders } = setup();
    expect(await reminders.add(bad as never, NOW)).toEqual({ ok: false, error: "INVALID" });
    expect(await reminders.list()).toEqual([]);
  });

  it(`at most ${MAX_REMINDERS} reminders`, async () => {
    const { reminders } = setup();
    for (let i = 0; i < MAX_REMINDERS; i++) expect((await reminders.add(input, NOW)).ok).toBe(true);
    expect(await reminders.add(input, NOW)).toEqual({ ok: false, error: "TOO_MANY" });
  });

  it("remove", async () => {
    const { reminders } = setup();
    await reminders.add(input, NOW);
    await reminders.add({ ...input, payeeId: PAPA.id }, NOW);
    await reminders.remove("r1");
    expect((await reminders.list()).map((r) => r.id)).toEqual(["r2"]);
  });

  it("fired: a one-time reminder is removed, a monthly one moves to next month", async () => {
    const { reminders } = setup();
    await reminders.add(input, NOW);
    await reminders.add({ ...input, when: { kind: "monthly", day: 1 } }, NOW);
    await reminders.fired("r1", ist("2026-11-01T09:00:00"));
    await reminders.fired("r2", ist("2026-11-01T09:00:00"));
    const left = await reminders.list();
    expect(left.map((r) => [r.id, r.nextAt])).toEqual([["r2", ist("2026-12-01T09:00:00")]]);
  });

  it("concurrent adds both land (one write at a time)", async () => {
    const { reminders } = setup();
    await Promise.all([reminders.add(input, NOW), reminders.add(input, NOW)]);
    expect(await reminders.list()).toHaveLength(2);
  });

  it("unreadable data → an empty list plus a backup, never a crash; bad entries are dropped", async () => {
    const good: Reminder = { id: "r9", ...input, createdAt: NOW };
    const { store, reminders } = setup({ [KEY]: JSON.stringify([good, { id: "bad", amountPaise: "lots" }]) });
    expect(await reminders.list()).toEqual([good]);
    const broken = setup({ [KEY]: "{not json" });
    expect(await broken.reminders.list()).toEqual([]);
    await broken.reminders.add(input, NOW);
    expect(broken.store.raw.get(`${KEY}.corrupt-backup`)).toBe("{not json");
    expect(store.raw.get(KEY)).toContain("r9");
  });
});

describe("notificationFor: what the notification says and carries", () => {
  const reminder: Reminder = {
    id: "r1",
    payeeId: MUMMY.id,
    amountPaise: 200000,
    when: { kind: "dayOfMonth", day: 1 },
    nextAt: ist("2026-11-01T09:00:00"),
    createdAt: ist("2026-10-15T15:00:00"),
  };

  it("names the payee and the amount; the data is only the reminder id", () => {
    expect(notificationFor(reminder, MUMMY)).toEqual({
      title: "Reminder: pay Mummy",
      body: "Send ₹2,000 to Mummy? Tap to open FlowPay. Nothing is paid until you confirm.",
      data: { reminderId: "r1" },
    });
  });

  it("without an amount", () => {
    const { amountPaise: _a, ...noAmount } = reminder;
    expect(notificationFor(noAmount, MUMMY).body).toBe("Send money to Mummy? Tap to open FlowPay. Nothing is paid until you confirm.");
  });

  it("never contains the UPI ID or phone number", () => {
    const text = JSON.stringify(notificationFor(reminder, MUMMY));
    expect(text).not.toContain(MUMMY.vpa);
    expect(text).not.toContain(MUMMY.phone!.slice(-10));
  });
});

describe("reminderPayment: what a ringing reminder opens", () => {
  const base: Reminder = {
    id: "r1",
    payeeId: MUMMY.id,
    amountPaise: 200000,
    when: { kind: "dayOfMonth", day: 1 },
    nextAt: 0,
    createdAt: 0,
  };

  it("a saved payee + an amount → a normal Confirm card (which still asks and listens)", () => {
    expect(reminderPayment(base, PAYEES)).toEqual({ kind: "confirm", payee: MUMMY, amountPaise: 200000 });
  });

  it("no amount → ask how much for that payee", () => {
    const { amountPaise: _a, ...noAmount } = base;
    expect(reminderPayment(noAmount, PAYEES)).toEqual({ kind: "askAmount", payee: MUMMY });
  });

  it("the payee was deleted since → nothing to pay", () => {
    expect(reminderPayment(base, [PAPA])).toEqual({ kind: "noPayee" });
  });
});

// On app start: a monthly reminder that rang (tapped or not) moves to next month, so it rings again;
// a one-time one that rang stays a week (a late tap still opens it), then goes.
describe("catchUp (app start)", () => {
  const NOW = ist("2026-11-03T12:00:00");
  const r = (id: string, when: Reminder["when"], nextAt: number): Reminder => ({ id, payeeId: MUMMY.id, when, nextAt, createdAt: 0 });

  it("future reminders are left alone", () => {
    const future = r("a", { kind: "dayOfMonth", day: 20 }, ist("2026-11-20T09:00:00"));
    expect(catchUp([future], NOW)).toEqual({ reminders: [future], removedIds: [] });
  });

  it("a monthly reminder that already rang moves to next month", () => {
    const rang = r("m", { kind: "monthly", day: 1 }, ist("2026-11-01T09:00:00"));
    expect(catchUp([rang], NOW).reminders).toEqual([{ ...rang, nextAt: ist("2026-12-01T09:00:00") }]);
  });

  it("a one-time reminder that rang is kept for 7 days, then removed", () => {
    const recent = r("o1", { kind: "inDays", days: 1 }, ist("2026-10-28T09:00:00")); // 6 days ago
    const old = r("o2", { kind: "dayOfMonth", day: 1 }, ist("2026-10-27T09:00:00")); // 7 days 3 h ago
    expect(catchUp([recent, old], NOW)).toEqual({ reminders: [recent], removedIds: ["o2"] });
  });

  it("the store applies it and returns what's left", async () => {
    const store = memoryStore({
      [KEY]: JSON.stringify([
        r("m", { kind: "monthly", day: 1 }, ist("2026-11-01T09:00:00")),
        r("o", { kind: "dayOfMonth", day: 1 }, ist("2026-10-01T09:00:00")),
      ]),
    });
    const reminders = createReminderStore(store);
    const left = await reminders.catchUp(NOW);
    expect(left.map((x) => [x.id, x.nextAt])).toEqual([["m", ist("2026-12-01T09:00:00")]]);
    expect((await reminders.list()).map((x) => x.id)).toEqual(["m"]);
  });
});

// M17: a regular payment (the same amount to the same payee, Done twice) → offer a monthly reminder
// on today's date. Only an offer: the reminder card still asks for the yes.
describe("suggestMonthlyReminder", () => {
  const TODAY = ist("2026-10-19T12:00:00");
  const earlier = entry({ id: "h-0", txnRef: "FP0", amountPaise: 60000, createdAt: ist("2026-09-19T10:00:00") });
  const now = entry({ id: "h-1", txnRef: "FP1", amountPaise: 60000, createdAt: TODAY });
  const base = { entry: now, history: [now, earlier], reminders: [] as Reminder[], now: TODAY };

  it("2nd Done payment of the same amount → monthly on today's IST date", () => {
    expect(suggestMonthlyReminder(base)).toEqual({ day: 19 });
  });

  it("uses the IST date (00:30 IST is still the day before in UTC)", () => {
    const late = ist("2026-10-20T00:30:00");
    expect(suggestMonthlyReminder({ ...base, entry: { ...now, createdAt: late }, now: late })).toEqual({ day: 20 });
  });

  it("first payment to this payee → nothing", () => {
    expect(suggestMonthlyReminder({ ...base, history: [now] })).toBeNull();
  });

  it("a different amount before → nothing", () => {
    expect(suggestMonthlyReminder({ ...base, history: [now, { ...earlier, amountPaise: 50000 }] })).toBeNull();
  });

  it("the earlier payment wasn't Done → nothing", () => {
    for (const status of ["failed", "pending", "unknown"] as const) {
      expect(suggestMonthlyReminder({ ...base, history: [now, { ...earlier, status }] })).toBeNull();
    }
  });

  it("this payment isn't Done → nothing", () => {
    expect(suggestMonthlyReminder({ ...base, entry: { ...now, status: "unknown" } })).toBeNull();
  });

  it("rehearsal payments never count", () => {
    expect(suggestMonthlyReminder({ ...base, entry: { ...now, txnRef: "RH1" } })).toBeNull();
    expect(suggestMonthlyReminder({ ...base, history: [now, { ...earlier, txnRef: "RH0" }] })).toBeNull();
  });

  it("the payee already has a reminder → nothing", () => {
    const r: Reminder = { id: "r", payeeId: MUMMY.id, when: { kind: "monthly", day: 1 }, nextAt: TODAY + 1, createdAt: TODAY };
    expect(suggestMonthlyReminder({ ...base, reminders: [r] })).toBeNull();
  });

  it("a reminder for someone else doesn't stop it", () => {
    const r: Reminder = { id: "r", payeeId: PAPA.id, when: { kind: "monthly", day: 1 }, nextAt: TODAY + 1, createdAt: TODAY };
    expect(suggestMonthlyReminder({ ...base, reminders: [r] })).toEqual({ day: 19 });
  });

  it.each([[29], [30], [31]])("the %ith → nothing (monthly reminders are days 1–28)", (day) => {
    const t = ist(`2026-10-${day}T12:00:00`);
    expect(suggestMonthlyReminder({ ...base, entry: { ...now, createdAt: t }, now: t })).toBeNull();
  });
});
