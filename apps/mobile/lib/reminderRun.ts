// Reminders, wired to the stores and the notification module (M13). The rules about dates and what a
// reminder opens are pure, in reminders.ts; this only reads/writes and schedules.
import { askForAmount, startConversation } from "./conversation";
import type { Payee } from "./payees";
import { txnRefFor } from "./rehearsal";
import { reminderPayment, type When } from "./reminders";
import {
  cancelReminderNotification,
  ensureNotificationPermission,
  scheduleReminder,
} from "./remindersNative";
import { conversation, payeeStore, rehearsal, reminderStore } from "./stores";

export type SaveResult = "saved" | "notificationsOff" | "unavailable" | "tooMany" | "failed";

// Notifications first: a reminder that can't ring is not saved at all.
export async function saveReminder(
  p: { payee: Payee; amountPaise?: number; when: When; nextAt: number },
  now: number,
): Promise<SaveResult> {
  const permission = await ensureNotificationPermission();
  if (permission !== "granted") return permission === "denied" ? "notificationsOff" : "unavailable";
  const added = await reminderStore.add(
    { payeeId: p.payee.id, ...(p.amountPaise ? { amountPaise: p.amountPaise } : {}), when: p.when, nextAt: p.nextAt },
    now,
  );
  if (!added.ok) return added.error === "TOO_MANY" ? "tooMany" : "failed";
  if (!(await scheduleReminder(added.reminder, p.payee))) {
    await reminderStore.remove(added.reminder.id);
    return "failed";
  }
  return "saved";
}

export async function deleteReminder(id: string): Promise<void> {
  await cancelReminderNotification(id);
  await reminderStore.remove(id);
}

// App start: monthly reminders that rang move on and are scheduled again (scheduling the same id
// again replaces it, so this is safe to repeat).
export async function syncReminders(now: number): Promise<void> {
  const [left, { payees }] = await Promise.all([reminderStore.catchUp(now), payeeStore.load()]);
  for (const r of left) {
    const payee = payees.find((p) => p.id === r.payeeId);
    if (payee && r.nextAt > now) await scheduleReminder(r, payee);
  }
}

export type ReminderTarget =
  | { kind: "confirm"; payeeId: string; amountPaise: number; txnRef: string }
  | { kind: "askAmount" } // Home, with "How much?" for that payee
  | { kind: "noPayee" }
  | { kind: "gone" };

// A reminder notification was tapped. It never pays: it opens a normal Confirm card (rule 8), or asks
// how much on Home.
export async function openReminder(id: string, now: number): Promise<ReminderTarget> {
  const reminder = await reminderStore.get(id);
  if (!reminder) return { kind: "gone" };
  const [{ payees }, updated] = await Promise.all([payeeStore.load(), reminderStore.fired(id, now)]);
  const payee = payees.find((p) => p.id === reminder.payeeId);
  if (updated && payee) await scheduleReminder(updated, payee);

  const what = reminderPayment(reminder, payees);
  if (what.kind === "noPayee") return what;
  if (what.kind === "askAmount") {
    // The payee's saved name stays in the phone's draft; the server only sees "How much?" and the answer.
    conversation.openFromOutside(askForAmount({ ...startConversation(), draft: { name: what.payee.displayName } }).state);
    return what;
  }
  conversation.reset();
  return { kind: "confirm", payeeId: what.payee.id, amountPaise: what.amountPaise, txnRef: txnRefFor(await rehearsal.load()) };
}
