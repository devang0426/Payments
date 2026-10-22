import { createHistoryStore } from "../history";
import { entry, ist, memoryStore } from "./fixtures";

const NOW = ist("2026-10-15T15:00:00");

const pending = (txnRef: string, createdAt = NOW, amountPaise = 10000) => {
  const { id: _id, ...rest } = entry({ txnRef, status: "pending", createdAt, amountPaise });
  return rest;
};

let n = 0;
const ids = () => `h${++n}`;

beforeEach(() => {
  n = 0;
});

describe("history store", () => {
  it("starts empty", async () => {
    expect(await createHistoryStore(memoryStore(), ids).load()).toEqual({ entries: [], corrupt: false });
  });

  it("adds an entry (newest first) and persists it", async () => {
    const storage = memoryStore();
    const store = createHistoryStore(storage, ids);
    await store.add(pending("FP1", ist("2026-10-15T10:00:00")));
    await store.add(pending("FP2", ist("2026-10-15T11:00:00")));
    const { entries } = await createHistoryStore(storage, ids).load();
    expect(entries.map((e) => e.txnRef)).toEqual(["FP2", "FP1"]);
    expect(entries[0]).toMatchObject({ id: "h2", status: "pending" });
  });

  it("rejects a duplicate txnRef", async () => {
    const store = createHistoryStore(memoryStore(), ids);
    await store.add(pending("FP1"));
    expect(await store.add(pending("FP1"))).toEqual({ ok: false, error: "DUPLICATE_TXN_REF" });
  });

  it.each([
    ["fractional paise", { amountPaise: 100.5 }],
    ["zero amount", { amountPaise: 0 }],
    ["empty txnRef", { txnRef: "" }],
  ])("rejects an invalid entry: %s", async (_label, override) => {
    expect(await createHistoryStore(memoryStore(), ids).add({ ...pending("FP1"), ...override })).toEqual({
      ok: false,
      error: "INVALID",
    });
  });

  it("listPending returns only pending entries", async () => {
    const store = createHistoryStore(memoryStore(), ids);
    await store.add(pending("FP1"));
    await store.add(pending("FP2"));
    await store.updateStatus("FP1", "success");
    expect((await store.listPending()).map((e) => e.txnRef)).toEqual(["FP2"]);
  });

  it("listToday uses the IST calendar day", async () => {
    const store = createHistoryStore(memoryStore(), ids);
    await store.add(pending("YESTERDAY", ist("2026-10-14T23:59:00")));
    await store.add(pending("TODAY", ist("2026-10-15T00:01:00")));
    expect((await store.listToday(NOW)).map((e) => e.txnRef)).toEqual(["TODAY"]);
  });
});

describe("history store: status changes", () => {
  it.each([
    ["pending", "success"],
    ["pending", "failed"],
    ["pending", "unknown"],
    ["unknown", "success"],
    ["unknown", "failed"],
  ] as const)("%s → %s is allowed", async (from, to) => {
    const store = createHistoryStore(memoryStore(), ids);
    await store.add(pending("FP1"));
    if (from === "unknown") await store.updateStatus("FP1", "unknown");
    expect(await store.updateStatus("FP1", to)).toEqual({ ok: true });
    expect((await store.load()).entries[0]!.status).toBe(to);
  });

  it.each([
    ["success", "failed"],
    ["success", "pending"],
    ["failed", "success"],
    ["unknown", "pending"],
  ] as const)("%s → %s is refused (final or backwards)", async (from, to) => {
    const store = createHistoryStore(memoryStore(), ids);
    await store.add(pending("FP1"));
    await store.updateStatus("FP1", from);
    expect(await store.updateStatus("FP1", to)).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect((await store.load()).entries[0]!.status).toBe(from);
  });

  it("unknown txnRef → NOT_FOUND", async () => {
    expect(await createHistoryStore(memoryStore(), ids).updateStatus("nope", "success")).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });
});

describe("history store: changes at the same moment don't overwrite each other", () => {
  it("two adds at once → both saved", async () => {
    const storage = memoryStore();
    const store = createHistoryStore(storage, ids);
    await Promise.all([store.add(pending("FP1")), store.add(pending("FP2", NOW + 1))]);
    const { entries } = await createHistoryStore(storage, ids).load();
    expect(entries.map((e) => e.txnRef).sort()).toEqual(["FP1", "FP2"]);
  });

  it("add, then updateStatus started right away → the update sees the new entry", async () => {
    const store = createHistoryStore(memoryStore(), ids);
    const [added, updated] = await Promise.all([store.add(pending("FP1")), store.updateStatus("FP1", "success")]);
    expect(added.ok).toBe(true);
    expect(updated).toEqual({ ok: true });
    expect((await store.load()).entries[0]).toMatchObject({ txnRef: "FP1", status: "success" });
  });

  it("an update and an add for different payments at once → both kept", async () => {
    const store = createHistoryStore(memoryStore(), ids);
    await store.add(pending("FP1"));
    await Promise.all([store.updateStatus("FP1", "failed"), store.add(pending("FP2", NOW + 1))]);
    const { entries } = await store.load();
    expect(entries.find((e) => e.txnRef === "FP1")?.status).toBe("failed");
    expect(entries.some((e) => e.txnRef === "FP2")).toBe(true);
  });
});

describe("history store: corrupt data never crashes", () => {
  it("unreadable JSON → empty list, corrupt: true", async () => {
    const storage = memoryStore();
    const store = createHistoryStore(storage, ids);
    await store.add(pending("FP1"));
    storage.raw.set([...storage.raw.keys()][0]!, "{not json");
    expect(await store.load()).toEqual({ entries: [], corrupt: true });
  });

  it("bad entries are skipped, good ones kept", async () => {
    const storage = memoryStore();
    const store = createHistoryStore(storage, ids);
    await store.add(pending("FP1"));
    const key = [...storage.raw.keys()][0]!;
    const stored = JSON.parse(storage.raw.get(key)!);
    storage.raw.set(key, JSON.stringify([...stored, { txnRef: "BAD", amountPaise: "500" }, 42]));
    const { entries, corrupt } = await store.load();
    expect(entries.map((e) => e.txnRef)).toEqual(["FP1"]);
    expect(corrupt).toBe(true);
  });

  it("adding still works after corruption, and the unreadable data is kept in a backup key", async () => {
    const storage = memoryStore();
    const store = createHistoryStore(storage, ids);
    await store.add(pending("FP1"));
    const key = [...storage.raw.keys()][0]!;
    storage.raw.set(key, "{not json");
    expect(await store.add(pending("FP2"))).toMatchObject({ ok: true });
    expect((await store.load()).entries.map((e) => e.txnRef)).toEqual(["FP2"]);
    const backups = [...storage.raw.entries()].filter(([k]) => k !== key);
    expect(backups.map(([, v]) => v)).toContain("{not json");
  });
});
