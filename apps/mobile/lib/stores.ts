// App-wide store instances (SecureStore / AsyncStorage on the phone).
import { createConfirmLock } from "./confirmLock";
import { isIdle, startConversation, type ConversationState, type ServerAction } from "./conversation";
import { createOutcomeStore } from "./explain";
import { createHelperStore } from "./helper";
import { createPreferenceStore } from "./preferences";
import { createHistoryStore } from "./history";
import { createPayeeStore } from "./payees";
import { createRehearsalSetting } from "./rehearsal";
import { createReminderStore } from "./reminders";
import type { QrPayee } from "./upi";

export const payeeStore = createPayeeStore();
export const historyStore = createHistoryStore();
export const confirmLock = createConfirmLock();
export const rehearsal = createRehearsalSetting();
export const reminderStore = createReminderStore();
export const helperStore = createHelperStore();
export const prefsStore = createPreferenceStore(); // M15
// M15 "Kyun block hua?": the phone's last outcome (no transcript), dropped after 10 minutes.
export const lastOutcome = createOutcomeStore();
// M15: the name she said for the card Home opened last (to explain "you said maa, saved as Mummy").
let spokenFor: { payeeId: string; spoken: string } | null = null;
export const lastSpokenName = {
  set: (payeeId: string, spoken: string) => {
    spokenFor = { payeeId, spoken };
  },
  for: (payeeId: string) => (spokenFor?.payeeId === payeeId ? spokenFor.spoken : undefined),
};

// The current conversation, shared by Home and the Confirm card. In memory only (never stored):
// it is cleared after a payment, a cancel, or when the user starts over.
// M17: a tapped reminder replaces it from outside Home (openFromOutside), and Home, if it is already
// on screen, asks the new question at once.
// M15: after 10 minutes without a change it is dropped (isIdle), so old words never linger.
let current: ConversationState = startConversation();
let touchedAt = Date.now();
const outsideListeners = new Set<() => void>();
export const conversation = {
  get: () => {
    if (isIdle(touchedAt, Date.now())) current = startConversation();
    return current;
  },
  set: (state: ConversationState) => {
    current = state;
    touchedAt = Date.now();
  },
  reset: () => {
    current = startConversation();
    touchedAt = Date.now();
  },
  openFromOutside: (state: ConversationState) => {
    current = state;
    touchedAt = Date.now();
    outsideListeners.forEach((fn) => fn());
  },
  onOutsideChange: (fn: () => void): (() => void) => {
    outsideListeners.add(fn);
    return () => {
      outsideListeners.delete(fn);
    };
  },
};

// A scanned UPI QR, handed from the scan screen back to the Add payee form (taken once). Memory only.
let scanned: Extract<QrPayee, { ok: true }> | null = null;
export const qrHandoff = {
  set: (result: Extract<QrPayee, { ok: true }>) => {
    scanned = result;
  },
  take: () => {
    const result = scanned;
    scanned = null;
    return result;
  },
};

// M14: further payments from one message ("Mummy ko 500 aur Papa ko 300"), waiting for their own
// card. In memory only. Home opens the next one when it comes back; a spoken cancel on a card or
// "Start over" clears it.
let queued: ServerAction[] = [];
export const paymentQueue = {
  set: (actions: ServerAction[]) => {
    queued = [...actions];
  },
  next: (): ServerAction | undefined => queued.shift(),
  size: () => queued.length,
  clear: () => {
    queued = [];
  },
};
