import { createPayeeStore } from "../payees";
import { memoryStore } from "./fixtures";

let n = 0;
const ids = () => `id${++n}`;

beforeEach(() => {
  n = 0;
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

  it("adds a payee with cleaned-up fields", async () => {
    const store = createPayeeStore(memoryStore(), ids);
    expect(await store.add(MUMMY_INPUT)).toEqual({
      ok: true,
      payee: {
        id: "id1",
        displayName: "Mummy",
        vpa: "mummy.fake@upi",
        phone: "+919000000001",
        aliases: ["mumma", "maa"],
      },
    });
  });

  it("phone is optional", async () => {
    const result = await createPayeeStore(memoryStore(), ids).add({ displayName: "Priya", vpa: "priya.fake@upi" });
    expect(result).toEqual({ ok: true, payee: { id: "id1", displayName: "Priya", vpa: "priya.fake@upi", aliases: [] } });
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
    const store = createPayeeStore(memoryStore(), ids);
    await store.add(MUMMY_INPUT);
    const result = await store.update("id1", { displayName: "Mom", vpa: "mummy.fake@upi", aliases: ["mummy"] });
    expect(result).toEqual({ ok: true, payee: { id: "id1", displayName: "Mom", vpa: "mummy.fake@upi", aliases: ["mummy"] } });
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
