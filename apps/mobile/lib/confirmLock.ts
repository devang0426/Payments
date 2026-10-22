// One "Yes" per payment: the lock is keyed by txnRef and persisted, so a double tap, re-render or
// re-mounted Confirm screen can never send the same payment twice.
import { asyncStore, createWriteQueue, type KeyValueStore } from "./storage";

const KEY = "flowpay.confirm-locks.v1";
const MAX_REFS = 200;

export function createConfirmLock(store: KeyValueStore = asyncStore) {
  // Synchronous guard for taps that land before the storage write finishes.
  const inFlight = new Set<string>();
  // Locks for different payments taken at the same moment must not overwrite each other's write.
  const queue = createWriteQueue();

  async function readUsed(): Promise<string[]> {
    const raw = await store.getItem(KEY);
    if (!raw) return [];
    try {
      const list: unknown = JSON.parse(raw);
      return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  }

  return {
    async isUsed(txnRef: string): Promise<boolean> {
      return inFlight.has(txnRef) || (await readUsed()).includes(txnRef);
    },

    // true exactly once per txnRef; every later call returns false.
    async acquire(txnRef: string): Promise<boolean> {
      if (!txnRef || inFlight.has(txnRef)) return false;
      inFlight.add(txnRef);
      return queue(async () => {
        const used = await readUsed();
        if (used.includes(txnRef)) return false;
        await store.setItem(KEY, JSON.stringify([txnRef, ...used].slice(0, MAX_REFS)));
        return true;
      });
    },
  };
}
