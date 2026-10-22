import { createPayeeStore } from "../payees";
import { ist, memoryStore } from "./fixtures";

let n = 0;
const ids = () => `id${++n}`;

// A fixed, movable clock for addedAt / vpaChangedAt.
const T0 = ist("2026-10-15T10:00:00");
const HOUR = 60 * 60 * 1000;
let now = T0;
const clock = () => now;

beforeEach(() => {
  n = 0;
  now = T0;
});

const MUMMY_INPUT = {
  displayName: " Mummy ",
  vpa: " Mummy.Fake@UPI ",
  phone: "+91 90000 00001",
  aliases: [" Mumma ", "maa", "MAA", ""],
};

describe("payee store", () => {
  it("starts empty", async () => {
    expect(await createPayeeStore(memoryStore(), ids).load()).toEqual({ payees: [], corrupt: false });
  });

  it("adds a payee with cleaned-up fields, saved and given its UPI ID now", async () => {
    const store = createPayeeStore(memoryStore(), ids, clock);
    expect(await store.add(MUMMY_INPUT)).toEqual({
      ok: true,
      payee: {
        id: "id1",
        displayName: "Mummy",
        vpa: "mummy.fake@upi",
        phone: "+919000000001",
        aliases: ["mumma", "maa"],
        addedAt: T0,
        vpaChangedAt: T0,
      },
    });
  });

  it("phone is optional", async () => {
    const result = await createPayeeStore(memoryStore(), ids, clock).add({ displayName: "Priya", vpa: "priya.fake@upi" });
    expect(result).toEqual({
      ok: true,
      payee: { id: "id1", displayName: "Priya", vpa: "priya.fake@upi", aliases: [], addedAt: T0, vpaChangedAt: T0 },
    });
  });

  it("persists across store instances (same storage)", async () => {
    const storage = memoryStore();
    await createPayeeStore(storage, ids).add(MUMMY_INPUT);
    const { payees } = await createPayeeStore(storage, ids).load();
    expect(payees.map((p) => p.displayName)).toEqual(["Mummy"]);
  });

  it.each([
    ["empty name", { displayName: "  ", vpa: "x.fake@upi" }, "INVALID_NAME"],
    ["name too long", { displayName: "x".repeat(51), vpa: "x.fake@upi" }, "INVALID_NAME"],
    ["bad UPI ID", { displayName: "X", vpa: "not-a-vpa" }, "INVALID_VPA"],
    ["bad phone", { displayName: "X", vpa: "x.fake@upi", phone: "12345" }, "INVALID_PHONE"],
    ["too many aliases", { displayName: "X", vpa: "x.fake@upi", aliases: Array.from({ length: 11 }, (_, i) => `a${i}`) }, "INVALID_ALIASES"],
  ])("rejects %s", async (_label, input, error) => {
    expect(await createPayeeStore(memoryStore(), ids).add(input)).toEqual({ ok: false, error });
  });

  it("rejects a UPI ID that is already saved (any case)", async () => {
    const store = createPayeeStore(memoryStore(), ids);
    await store.add(MUMMY_INPUT);
    expect(await store.add({ displayName: "Other", vpa: "MUMMY.fake@upi" })).toEqual({
      ok: false,
      error: "DUPLICATE_VPA",
    });
  });

  it("updates a payee", async () => {
    const store = createPayeeStore(memoryStore(), ids, clock);
    await store.add(MUMMY_INPUT);
    now = T0 + HOUR;
    const result = await store.update("id1", { displayName: "Mom", vpa: "mummy.fake@upi", aliases: ["mummy"] });
    expect(result).toEqual({
      ok: true,
      payee: { id: "id1", displayName: "Mom", vpa: "mummy.fake@upi", aliases: ["mummy"], addedAt: T0, vpaChangedAt: T0 },
    });
    expect((await store.load()).payees).toHaveLength(1);
  });

  it("update keeps its own UPI ID but not another payee's", async () => {
    const store = createPayeeStore(memoryStore(), ids);
    await store.add(MUMMY_INPUT);
    await store.add({ displayName: "Papa", vpa: "papa.fake@upi" });
    expect(await store.update("id2", { displayName: "Papa", vpa: "mummy.fake@upi" })).toEqual({
      ok: false,
      error: "DUPLICATE_VPA",
    });
  });

  it("update of an unknown id → NOT_FOUND", async () => {
    expect(await createPayeeStore(memoryStore(), ids).update("nope", { displayName: "X", vpa: "x.fake@upi" })).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });

  it("removes a payee and its stored entry", async () => {
    const storage = memoryStore();
    const store = createPayeeStore(storage, ids);
    await store.add(MUMMY_INPUT);
    await store.add({ displayName: "Papa", vpa: "papa.fake@upi" });
    expect(await store.remove("id1")).toBe(true);
    expect((await store.load()).payees.map((p) => p.displayName)).toEqual(["Papa"]);
    expect([...storage.raw.keys()].some((k) => k.includes("id1"))).toBe(false);
    expect(await store.remove("id1")).toBe(false);
  });

  it("stores each payee under its own SecureStore-safe key (values stay small)", async () => {
    const storage = memoryStore();
    const store = createPayeeStore(storage, ids);
    await store.add(MUMMY_INPUT);
    await store.add({ displayName: "Papa", vpa: "papa.fake@upi" });
    for (const [key, value] of storage.raw) {
      expect(key).toMatch(/^[\w.-]+$/);
      expect(value.length).toBeLessThan(2048);
    }
    expect(storage.raw.size).toBe(3); // index + 2 payees
  });
});

describe("payee store: when a payee was saved and got its UPI ID (24 h new-payee limit)", () => {
  it("changing the UPI ID sets vpaChangedAt to now and keeps addedAt", async () => {
    const store = createPayeeStore(memoryStore(), ids, clock);
    await store.add(MUMMY_INPUT);
    now = T0 + 48 * HOUR;
    const result = await store.update("id1", { displayName: "Mummy", vpa: "mummy.new.fake@upi" });
    expect(result).toMatchObject({ ok: true, payee: { addedAt: T0, vpaChangedAt: T0 + 48 * HOUR } });
  });

  it("the same UPI ID typed differently (case, spaces) is not a change", async () => {
    const store = createPayeeStore(memoryStore(), ids, clock);
    await store.add(MUMMY_INPUT);
    now = T0 + 48 * HOUR;
    const result = await store.update("id1", { displayName: "Mummy", vpa: "  MUMMY.fake@upi " });
    expect(result).toMatchObject({ ok: true, payee: { addedAt: T0, vpaChangedAt: T0 } });
  });

  it("changing only the name, phone or other names keeps both timestamps", async () => {
    const store = createPayeeStore(memoryStore(), ids, clock);
    await store.add(MUMMY_INPUT);
    now = T0 + 48 * HOUR;
    const result = await store.update("id1", {
      displayName: "Mom",
      vpa: "mummy.fake@upi",
      phone: "+91 90000 00009",
      aliases: ["ma"],
    });
    expect(result).toMatchObject({ ok: true, payee: { addedAt: T0, vpaChangedAt: T0 } });
  });

  it("the timestamps survive a restart (new store instance, same storage)", async () => {
    const storage = memoryStore();
    await createPayeeStore(storage, ids, clock).add(MUMMY_INPUT);
    now = T0 + 5 * HOUR;
    const { payees } = await createPayeeStore(storage, ids, clock).load();
    expect(payees[0]).toMatchObject({ addedAt: T0, vpaChangedAt: T0 });
  });
});

describe("payee store: payees saved before M10 (no timestamps)", () => {
  // What M3–M9 wrote: the same payee without addedAt / vpaChangedAt.
  const legacyStorage = () =>
    memoryStore({
      "flowpay.payees.index": JSON.stringify(["old1"]),
      "flowpay.payee.old1": JSON.stringify({
        id: "old1",
        displayName: "Mummy",
        vpa: "mummy.fake@upi",
        aliases: ["maa"],
      }),
    });

  it("load still returns them, as saved now (safe side: one 24 h limit after the update)", async () => {
    const { payees, corrupt } = await createPayeeStore(legacyStorage(), ids, clock).load();
    expect(corrupt).toBe(false);
    expect(payees).toEqual([
      { id: "old1", displayName: "Mummy", vpa: "mummy.fake@upi", aliases: ["maa"], addedAt: T0, vpaChangedAt: T0 },
    ]);
  });

  it("the migration time is written once: a later load doesn't restart the 24 h", async () => {
    const storage = legacyStorage();
    await createPayeeStore(storage, ids, clock).load();
    now = T0 + 30 * HOUR;
    const { payees } = await createPayeeStore(storage, ids, clock).load();
    expect(payees[0]).toMatchObject({ addedAt: T0, vpaChangedAt: T0 });
  });

  it("an entry with broken timestamps is corrupt (skipped), not migrated", async () => {
    const storage = memoryStore({
      "flowpay.payees.index": JSON.stringify(["bad1"]),
      "flowpay.payee.bad1": JSON.stringify({
        id: "bad1",
        displayName: "Mummy",
        vpa: "mummy.fake@upi",
        aliases: [],
        addedAt: -5,
        vpaChangedAt: "yesterday",
      }),
    });
    expect(await createPayeeStore(storage, ids, clock).load()).toEqual({ payees: [], corrupt: true });
  });
});

describe("payee store: changes at the same moment don't overwrite each other", () => {
  it("two adds at once → both saved", async () => {
    const storage = memoryStore();
    const store = createPayeeStore(storage, ids, clock);
    await Promise.all([
      store.add({ displayName: "Mummy", vpa: "mummy.fake@upi" }),
      store.add({ displayName: "Papa", vpa: "papa.fake@upi" }),
    ]);
    const { payees } = await createPayeeStore(storage, ids, clock).load();
    expect(payees.map((p) => p.displayName).sort()).toEqual(["Mummy", "Papa"]);
  });

  it("two adds of the same UPI ID at once → only one is saved", async () => {
    const store = createPayeeStore(memoryStore(), ids, clock);
    const results = await Promise.all([
      store.add({ displayName: "Mummy", vpa: "mummy.fake@upi" }),
      store.add({ displayName: "Mom", vpa: "mummy.fake@upi" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await store.load()).payees).toHaveLength(1);
  });

  it("add + remove of another payee at once → both happen", async () => {
    const store = createPayeeStore(memoryStore(), ids, clock);
    await store.add({ displayName: "Mummy", vpa: "mummy.fake@upi" });
    await Promise.all([store.add({ displayName: "Papa", vpa: "papa.fake@upi" }), store.remove("id1")]);
    expect((await store.load()).payees.map((p) => p.displayName)).toEqual(["Papa"]);
  });
});

describe("payee store: corrupt data never crashes", () => {
  it("unreadable index → empty list, corrupt: true", async () => {
    const storage = memoryStore();
    await createPayeeStore(storage, ids).add(MUMMY_INPUT);
    const indexKey = [...storage.raw.keys()].find((k) => k.endsWith("index"))!;
    storage.raw.set(indexKey, "{not json");
    expect(await createPayeeStore(storage, ids).load()).toEqual({ payees: [], corrupt: true });
  });

  it("one bad payee entry is skipped, the rest still load", async () => {
    const storage = memoryStore();
    const store = createPayeeStore(storage, ids);
    await store.add(MUMMY_INPUT);
    await store.add({ displayName: "Papa", vpa: "papa.fake@upi" });
    const mummyKey = [...storage.raw.keys()].find((k) => k.endsWith("id1"))!;
    storage.raw.set(mummyKey, JSON.stringify({ id: "id1", displayName: "Mummy", vpa: 42 }));
    const { payees, corrupt } = await store.load();
    expect(payees.map((p) => p.displayName)).toEqual(["Papa"]);
    expect(corrupt).toBe(true);
  });

  it("a missing payee entry is skipped", async () => {
    const storage = memoryStore();
    const store = createPayeeStore(storage, ids);
    await store.add(MUMMY_INPUT);
    storage.raw.delete([...storage.raw.keys()].find((k) => k.endsWith("id1"))!);
    expect(await store.load()).toEqual({ payees: [], corrupt: true });
  });
});
