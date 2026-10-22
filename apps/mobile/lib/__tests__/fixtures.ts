// Fake test data only. Never put real UPI IDs or phone numbers here.
import type { HistoryEntry } from "../history";
import type { Payee } from "../payees";
import type { KeyValueStore } from "../storage";

// Times in IST, built from UTC (IST = UTC+05:30).
export const ist = (isoLocal: string): number => Date.parse(`${isoLocal}+05:30`);

// Saved long before any test's "now", so the 24 h new-payee limit never applies by accident.
export const LONG_AGO = ist("2026-01-01T00:00:00");
const old = { addedAt: LONG_AGO, vpaChangedAt: LONG_AGO };

export const MUMMY: Payee = {
  id: "p-mummy",
  displayName: "Mummy",
  vpa: "mummy.fake@upi",
  phone: "+919000000001",
  aliases: ["mumma", "maa", "mom"],
  ...old,
};

export const PAPA: Payee = {
  id: "p-papa",
  displayName: "Papa",
  vpa: "papa.fake@upi",
  phone: "+919000000002",
  aliases: ["dad"],
  ...old,
};

export const RAHUL_SHARMA: Payee = {
  id: "p-rahul-s",
  displayName: "Rahul Sharma",
  vpa: "rahul.sharma.fake@upi",
  phone: "+919000000003",
  aliases: ["rahul bhaiya"],
  ...old,
};

export const RAHUL_VERMA: Payee = {
  id: "p-rahul-v",
  displayName: "Rahul Verma",
  vpa: "rahul.verma.fake@upi",
  aliases: [],
  ...old,
};

export const PRIYA: Payee = {
  id: "p-priya",
  displayName: "Priya",
  vpa: "priya.fake@upi",
  aliases: ["priya didi"],
  ...old,
};

export const PAYEES: Payee[] = [MUMMY, PAPA, RAHUL_SHARMA, RAHUL_VERMA, PRIYA];

export function entry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: "h-1",
    txnRef: "FP1",
    payeeId: MUMMY.id,
    payeeName: MUMMY.displayName,
    amountPaise: 10000,
    status: "success",
    createdAt: ist("2026-10-15T12:00:00"),
    ...overrides,
  };
}

// In-memory KeyValueStore for storage tests. `raw` exposes what was written.
export function memoryStore(initial: Record<string, string> = {}): KeyValueStore & {
  raw: Map<string, string>;
} {
  const raw = new Map(Object.entries(initial));
  return {
    raw,
    async getItem(key) {
      return raw.get(key) ?? null;
    },
    async setItem(key, value) {
      raw.set(key, value);
    },
    async removeItem(key) {
      raw.delete(key);
    },
  };
}
