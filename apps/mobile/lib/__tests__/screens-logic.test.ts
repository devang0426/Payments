import { createConfirmLock } from "../confirmLock";
import { lastPaidAmount, resolvePayment } from "../flow";
import { formatIstDateTime, formatRupees, lastFour, maskVpa, spokenRupees } from "../format";
import { createHistoryStore } from "../history";
import { MUMMY, PAYEES, RAHUL_SHARMA, RAHUL_VERMA, entry, ist, memoryStore } from "./fixtures";

describe("format", () => {
  it.each([
    [100, "₹1"],
    [50000, "₹500"],
    [150000, "₹1,500"],
    [150050, "₹1,500.50"],
    [12345678, "₹1,23,456.78"],
    [500000, "₹5,000"],
    [5, "₹0.05"],
  ])("formatRupees(%i) → %s", (paise, text) => {
    expect(formatRupees(paise)).toBe(text);
  });

  it.each([
    ["mummy.fake@upi", "mu•••@upi"],
    ["ab@okaxis", "a•••@okaxis"],
    ["noat", "•••"],
  ])("maskVpa(%j) → %j", (vpa, masked) => {
    expect(maskVpa(vpa)).toBe(masked);
  });

  it.each([
    [50000, "500 rupees"],
    [100, "1 rupee"],
    [10150, "101 rupees 50 paise"],
    [50, "50 paise"],
    [300000, "3000 rupees"],
  ])("spokenRupees(%i) → %s", (paise, text) => {
    expect(spokenRupees(paise)).toBe(text);
  });

  it("lastFour", () => {
    expect(lastFour("+919000000001")).toBe("0001");
    expect(lastFour(undefined)).toBeNull();
  });

  it.each([
    ["2026-10-15T15:05:00", "15 Oct 2026, 3:05 PM"],
    ["2026-10-15T00:01:00", "15 Oct 2026, 12:01 AM"],
    ["2026-10-15T12:00:00", "15 Oct 2026, 12:00 PM"],
  ])("formatIstDateTime(%s IST) → %s", (local, text) => {
    expect(formatIstDateTime(ist(local))).toBe(text);
  });
});

describe("confirm lock", () => {
  it("allows exactly one Yes per txnRef", async () => {
    const lock = createConfirmLock(memoryStore());
    expect(await lock.acquire("FP1")).toBe(true);
    expect(await lock.acquire("FP1")).toBe(false);
    expect(await lock.acquire("FP2")).toBe(true);
  });

  it("two taps in the same moment → only one wins", async () => {
    const lock = createConfirmLock(memoryStore());
    const results = await Promise.all([lock.acquire("FP1"), lock.acquire("FP1"), lock.acquire("FP1")]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("survives a re-mount / app restart (new instance, same storage)", async () => {
    const storage = memoryStore();
    await createConfirmLock(storage).acquire("FP1");
    const again = createConfirmLock(storage);
    expect(await again.isUsed("FP1")).toBe(true);
    expect(await again.acquire("FP1")).toBe(false);
  });

  it("an empty txnRef is never accepted", async () => {
    expect(await createConfirmLock(memoryStore()).acquire("")).toBe(false);
  });

  it("two different payments confirmed at the same moment → both locks are saved", async () => {
    const storage = memoryStore();
    const lock = createConfirmLock(storage);
    expect(await Promise.all([lock.acquire("FP1"), lock.acquire("FP2")])).toEqual([true, true]);
    const again = createConfirmLock(storage);
    expect(await again.isUsed("FP1")).toBe(true);
    expect(await again.isUsed("FP2")).toBe(true);
  });
});

describe("resolvePayment", () => {
  const base = { payees: PAYEES, history: [], historyUnreadable: false, now: ist("2026-10-15T12:00:00") };
  const paise = (n: number) => ({ kind: "paise" as const, paise: n });
  const LAST = { kind: "last" as const };

  it("one payee + allowed → confirm with ok rule", () => {
    expect(resolvePayment({ ...base, name: "Mummy", amount: paise(50000) })).toEqual({
      kind: "confirm",
      payee: MUMMY,
      amountPaise: 50000,
      rule: { ok: true },
    });
  });

  it("one payee + over the limit → confirm with the failed rule (red card)", () => {
    const result = resolvePayment({ ...base, name: "Mummy", amount: paise(400000) });
    expect(result).toMatchObject({ kind: "confirm", rule: { ok: false, reason: "OVER_PER_PAYMENT" } });
  });

  it("daily limit uses the history", () => {
    const result = resolvePayment({ ...base, history: [entry({ amountPaise: 450000 })], name: "Mummy", amount: paise(60000) });
    expect(result).toMatchObject({ kind: "confirm", rule: { ok: false, reason: "OVER_DAILY" } });
  });

  it("several payees → choose (amount passed through)", () => {
    expect(resolvePayment({ ...base, name: "Rahul", amount: paise(100) })).toEqual({
      kind: "choose",
      name: "Rahul",
      amount: paise(100),
      payees: [RAHUL_SHARMA, RAHUL_VERMA],
    });
  });

  it("no payee → noPayee", () => {
    expect(resolvePayment({ ...base, name: "Chacha", amount: paise(100) })).toEqual({ kind: "noPayee", name: "Chacha" });
  });

  it('"same as last time" uses that payee\'s last successful amount', () => {
    const history = [
      entry({ txnRef: "NEW", amountPaise: 99900, status: "failed", createdAt: ist("2026-10-14T12:00:00") }),
      entry({ txnRef: "MID", amountPaise: 25000, status: "success", createdAt: ist("2026-10-13T12:00:00") }),
      entry({ txnRef: "OLD", amountPaise: 10000, status: "success", createdAt: ist("2026-10-12T12:00:00") }),
      entry({ txnRef: "OTHER", payeeId: "p-papa", amountPaise: 77700, status: "success", createdAt: ist("2026-10-14T13:00:00") }),
    ];
    expect(resolvePayment({ ...base, history, name: "Mummy", amount: LAST })).toEqual({
      kind: "confirm",
      payee: MUMMY,
      amountPaise: 25000,
      rule: { ok: true },
    });
  });

  it('"same as last time" with no previous successful payment → noPrevious', () => {
    const history = [entry({ amountPaise: 5000, status: "unknown" })];
    expect(resolvePayment({ ...base, history, name: "Mummy", amount: LAST })).toEqual({ kind: "noPrevious", payee: MUMMY });
  });

  it('"same as last time" still goes through the rules', () => {
    const history = [
      entry({ txnRef: "A", amountPaise: 300000, status: "success", createdAt: ist("2026-10-15T09:00:00") }),
      entry({ txnRef: "B", amountPaise: 150000, status: "success", createdAt: ist("2026-10-15T10:00:00"), payeeId: "p-papa" }),
    ];
    expect(resolvePayment({ ...base, history, name: "Mummy", amount: LAST })).toMatchObject({
      kind: "confirm",
      amountPaise: 300000,
      rule: { ok: false, reason: "OVER_DAILY" },
    });
  });
});

describe("lastPaidAmount", () => {
  it("newest successful payment to this payee, or null", () => {
    const history = [
      entry({ txnRef: "1", amountPaise: 111, status: "pending", createdAt: ist("2026-10-15T12:00:00") }),
      entry({ txnRef: "2", amountPaise: 222, status: "success", createdAt: ist("2026-10-14T12:00:00") }),
    ];
    expect(lastPaidAmount(MUMMY.id, history)).toBe(222);
    expect(lastPaidAmount("nobody", history)).toBeNull();
  });
});

describe("history store: clear + DEV seed removal", () => {
  it("clear() empties the history and backs up unreadable data", async () => {
    const storage = memoryStore();
    const store = createHistoryStore(storage);
    await store.add({ ...entry(), txnRef: "FP1" });
    const key = [...storage.raw.keys()][0]!;
    storage.raw.set(key, "{bad");
    await store.clear();
    expect(await store.load()).toEqual({ entries: [], corrupt: false });
    expect([...storage.raw.values()]).toContain("{bad");
  });

  it("removeByTxnRefPrefix removes only seeded entries", async () => {
    const store = createHistoryStore(memoryStore());
    await store.add({ ...entry(), txnRef: "SEED1" });
    await store.add({ ...entry(), txnRef: "SEED2" });
    await store.add({ ...entry(), txnRef: "FP1" });
    expect(await store.removeByTxnRefPrefix("SEED")).toBe(2);
    expect((await store.load()).entries.map((e) => e.txnRef)).toEqual(["FP1"]);
  });
});
