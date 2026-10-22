// Local payment history in AsyncStorage (never leaves the phone). Validated with Zod on read.
// A "pending" entry is written before PhonePe opens (M5), so a killed app can't lose a payment.
import { z } from "zod";
import { istDayKey } from "./rules";
import { asyncStore, createWriteQueue, type KeyValueStore } from "./storage";

const KEY = "flowpay.history.v1";
const BACKUP_KEY = "flowpay.history.corrupt-backup";
const MAX_ENTRIES = 500;

export const PaymentStatusSchema = z.enum(["pending", "success", "failed", "unknown"]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const HistoryEntrySchema = z.object({
  id: z.string().min(1),
  txnRef: z.string().min(1).max(35),
  payeeId: z.string().min(1),
  payeeName: z.string().min(1),
  amountPaise: z.number().int().positive(),
  status: PaymentStatusSchema,
  createdAt: z.number().int().nonnegative(),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
export type NewHistoryEntry = Omit<HistoryEntry, "id">;

// Allowed status changes. success/failed are final.
const ALLOWED: Record<PaymentStatus, readonly PaymentStatus[]> = {
  pending: ["success", "failed", "unknown"],
  unknown: ["success", "failed"],
  success: [],
  failed: [],
};

const defaultId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function createHistoryStore(store: KeyValueStore = asyncStore, newId: () => string = defaultId) {
  const queue = createWriteQueue(); // every change below reads, changes and writes as one step

  async function read(): Promise<{ entries: HistoryEntry[]; corrupt: boolean; raw: string | null }> {
    const raw = await store.getItem(KEY);
    if (raw === null) return { entries: [], corrupt: false, raw };
    let list: unknown;
    try {
      list = JSON.parse(raw);
    } catch {
      return { entries: [], corrupt: true, raw };
    }
    if (!Array.isArray(list)) return { entries: [], corrupt: true, raw };
    const entries: HistoryEntry[] = [];
    for (const item of list) {
      const parsed = HistoryEntrySchema.safeParse(item);
      if (parsed.success) entries.push(parsed.data);
    }
    return { entries, corrupt: entries.length !== list.length, raw };
  }

  async function write(entries: HistoryEntry[], previous: { corrupt: boolean; raw: string | null }) {
    // Never silently drop data we couldn't read: keep a copy before overwriting it.
    if (previous.corrupt && previous.raw !== null) await store.setItem(BACKUP_KEY, previous.raw);
    await store.setItem(KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  }

  async function load(): Promise<{ entries: HistoryEntry[]; corrupt: boolean }> {
    const { entries, corrupt } = await read();
    return { entries, corrupt };
  }

  return {
    load,

    // Newest first.
    add(input: NewHistoryEntry): Promise<{ ok: true; entry: HistoryEntry } | { ok: false; error: "INVALID" | "DUPLICATE_TXN_REF" }> {
      return queue(async () => {
        const parsed = HistoryEntrySchema.safeParse({ id: newId(), ...input });
        if (!parsed.success) return { ok: false, error: "INVALID" };
        const current = await read();
        if (current.entries.some((e) => e.txnRef === parsed.data.txnRef)) {
          return { ok: false, error: "DUPLICATE_TXN_REF" };
        }
        const entries = [parsed.data, ...current.entries].sort((a, b) => b.createdAt - a.createdAt);
        await write(entries, current);
        return { ok: true, entry: parsed.data };
      });
    },

    updateStatus(
      txnRef: string,
      status: PaymentStatus,
    ): Promise<{ ok: true } | { ok: false; error: "NOT_FOUND" | "NOT_ALLOWED" }> {
      return queue(async () => {
        const current = await read();
        const existing = current.entries.find((e) => e.txnRef === txnRef);
        if (!existing) return { ok: false, error: "NOT_FOUND" };
        if (!ALLOWED[existing.status].includes(status)) return { ok: false, error: "NOT_ALLOWED" };
        await write(
          current.entries.map((e) => (e.txnRef === txnRef ? { ...e, status } : e)),
          current,
        );
        return { ok: true };
      });
    },

    // Settings → "Clear unreadable history" (and DEV "clear all"). Keeps a backup if it was unreadable.
    clear(): Promise<void> {
      return queue(async () => {
        const current = await read();
        if (current.corrupt && current.raw !== null) await store.setItem(BACKUP_KEY, current.raw);
        await store.removeItem(KEY);
      });
    },

    // Remove entries whose txnRef starts with the prefix (DEV seed, rehearsal payments).
    removeByTxnRefPrefix(prefix: string): Promise<number> {
      return queue(async () => {
        const current = await read();
        const kept = current.entries.filter((e) => !e.txnRef.startsWith(prefix));
        await write(kept, current);
        return current.entries.length - kept.length;
      });
    },

    async listPending(): Promise<HistoryEntry[]> {
      return (await load()).entries.filter((e) => e.status === "pending");
    },

    async listToday(now: number): Promise<HistoryEntry[]> {
      const today = istDayKey(now);
      return (await load()).entries.filter((e) => istDayKey(e.createdAt) === today);
    },
  };
}
