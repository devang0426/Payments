// Rehearsal mode: practise the whole demo without moving money. While it's on, "Yes" uses a fake
// launcher (no UPI app opens) and every payment's txnRef starts with "RH", so rehearsal payments can
// be told apart and cleared. They still count toward the daily limit (the safe side).
import type { Launcher } from "./pay";
import { asyncStore, type KeyValueStore } from "./storage";
import { makeTxnRef } from "./upi";

export const REHEARSAL_PREFIX = "RH";
const KEY = "flowpay.rehearsal.v1";
const FAKE_DELAY_MS = 800;

export const isRehearsalRef = (txnRef: string) => txnRef.startsWith(REHEARSAL_PREFIX);

// Same shape and length as makeTxnRef() ("FP…"), with "RH" in rehearsal mode.
export function txnRefFor(rehearsal: boolean, now?: number): string {
  const ref = makeTxnRef(now);
  return rehearsal ? REHEARSAL_PREFIX + ref.slice(2) : ref;
}

// Stands in for PhonePe: a short pause, then "success". Never opens any app.
export const rehearsalLauncher: Launcher = () =>
  new Promise((resolve) => setTimeout(() => resolve("success"), FAKE_DELAY_MS));

// Which launcher may send this payment. The txnRef (made when the payment was prepared) and the
// current mode must agree; if the mode was switched in between, nothing is sent (null).
export function launcherFor(txnRef: string, rehearsalOn: boolean, real: Launcher): Launcher | null {
  if (isRehearsalRef(txnRef) !== rehearsalOn) return null;
  return rehearsalOn ? rehearsalLauncher : real;
}

// The on/off switch, persisted. Off by default and when the stored value can't be read.
export function createRehearsalSetting(store: KeyValueStore = asyncStore) {
  let on = false;
  const listeners = new Set<(on: boolean) => void>();
  const notify = () => listeners.forEach((fn) => fn(on));

  return {
    // Last known value (for the banner); screens that decide anything call load().
    get: () => on,

    async load(): Promise<boolean> {
      try {
        on = (await store.getItem(KEY)) === "1";
      } catch {
        on = false;
      }
      notify();
      return on;
    },

    async set(value: boolean): Promise<void> {
      await store.setItem(KEY, value ? "1" : "0");
      on = value;
      notify();
    },

    subscribe(fn: (on: boolean) => void): () => void {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
