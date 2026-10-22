// Payment reminders (M13). The server sends a fixed "when" parsed by code; the phone works out the IST
// time (always 9:00 AM), stores the reminder structured (payeeId, paise, when: never the user's words,
// never a UPI ID) and schedules a local notification (remindersNative.ts). When it rings it opens a
// normal Confirm card that asks and listens (rule 8). A reminder never pays on its own.
// Pure, except the store, which takes a KeyValueStore.
import { z } from "zod";
import { formatRupees } from "./format";
import type { HistoryEntry } from "./history";
import type { Payee } from "./payees";
import { isRehearsalRef } from "./rehearsal";
import { asyncStore, createWriteQueue, type KeyValueStore } from "./storage";

export const REMINDER_HOUR_IST = 9;
export const MAX_REMINDERS = 20;

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // India has no DST
const KEY = "flowpay.reminders.v1";
const BACKUP_KEY = `${KEY}.corrupt-backup`;

export const WhenSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("inDays"), days: z.union([z.literal(1), z.literal(2)]) }),
  z.object({ kind: z.literal("dayOfMonth"), day: z.number().int().min(1).max(31) }),
  z.object({ kind: z.literal("monthly"), day: z.number().int().min(1).max(28) }),
]);
export type When = z.infer<typeof WhenSchema>;

export const ReminderSchema = z.object({
  id: z.string().min(1),
  payeeId: z.string().min(1),
  amountPaise: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  when: WhenSchema,
  nextAt: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
});
export type Reminder = z.infer<typeof ReminderSchema>;
export type NewReminder = Pick<Reminder, "payeeId" | "amountPaise" | "when" | "nextAt">;

// 9:00 IST on a calendar date (an overflowing month or day is handled by Date.UTC).
const at9 = (y: number, m: number, d: number) => Date.UTC(y, m, d, REMINDER_HOUR_IST) - IST_OFFSET_MS;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

// The next 9:00 AM IST that matches, strictly after `now`.
export function nextReminderAt(when: When, now: number): number {
  const ist = new Date(now + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  if (when.kind === "inDays") return at9(y, m, ist.getUTCDate() + when.days);
  // This month or later; skip months without that day (the 31st in November → 31 December).
  for (let i = 0; i < 13; i++) {
    const year = y + Math.floor((m + i) / 12);
    const month = (m + i) % 12;
    if (when.day > daysIn(year, month)) continue;
    const t = at9(year, month, when.day);
    if (t > now) return t;
  }
  throw new Error("unreachable: every day 1–31 occurs within 13 months");
}

// M17: a regular payment (the same amount to the same payee, Done twice, rehearsals never count) →
// offer "every month on today's date" (IST, days 1–28 like "har mahine"), unless that payee already has
// a reminder. Only an offer: the reminder card still asks for the yes.
export function suggestMonthlyReminder(p: {
  entry: HistoryEntry;
  history: HistoryEntry[];
  reminders: Reminder[];
  now: number;
}): { day: number } | null {
  const { entry } = p;
  const done = (e: HistoryEntry) => e.status === "success" && !isRehearsalRef(e.txnRef);
  if (!done(entry)) return null;
  if (p.reminders.some((r) => r.payeeId === entry.payeeId)) return null;
  const regular = p.history.some(
    (e) =>
      e.txnRef !== entry.txnRef &&
      e.payeeId === entry.payeeId &&
      e.amountPaise === entry.amountPaise &&
      e.createdAt < entry.createdAt &&
      done(e),
  );
  if (!regular) return null;
  const day = new Date(p.now + IST_OFFSET_MS).getUTCDate();
  return day <= 28 ? { day } : null;
}

// After a reminder rang: monthly → next month's date; once → null (it's done).
export function nextAfterFired(when: When, firedAt: number): number | null {
  return when.kind === "monthly" ? nextReminderAt(when, firedAt) : null;
}

// A one-time reminder that rang stays this long, so a late tap on its notification still opens it.
export const KEEP_RANG_MS = 7 * 24 * 60 * 60 * 1000;

// On app start: monthly reminders that rang (tapped or not) move to their next date, so they ring
// again; one-time ones that rang more than 7 days ago are removed.
export function catchUp(reminders: Reminder[], now: number): { reminders: Reminder[]; removedIds: string[] } {
  const kept: Reminder[] = [];
  const removedIds: string[] = [];
  for (const r of reminders) {
    if (r.nextAt > now) kept.push(r);
    else if (r.when.kind === "monthly") kept.push({ ...r, nextAt: nextReminderAt(r.when, now) });
    else if (now - r.nextAt <= KEEP_RANG_MS) kept.push(r);
    else removedIds.push(r.id);
  }
  return { reminders: kept, removedIds };
}

// The notification's own id, so it can be cancelled with the reminder.
export const notificationIdFor = (reminderId: string) => `reminder-${reminderId}`;

export function notificationFor(reminder: Omit<Reminder, "amountPaise"> & { amountPaise?: number }, payee: Pick<Payee, "displayName">) {
  const what = reminder.amountPaise ? formatRupees(reminder.amountPaise) : "money";
  return {
    title: `Reminder: pay ${payee.displayName}`,
    body: `Send ${what} to ${payee.displayName}? Tap to open FlowPay. Nothing is paid until you confirm.`,
    data: { reminderId: reminder.id },
  };
}

export type ReminderPayment =
  | { kind: "confirm"; payee: Payee; amountPaise: number }
  | { kind: "askAmount"; payee: Payee }
  | { kind: "noPayee" };

// What a ringing reminder opens. The Confirm card runs the rules and asks for the yes as usual.
export function reminderPayment(reminder: Omit<Reminder, "amountPaise"> & { amountPaise?: number }, payees: Payee[]): ReminderPayment {
  const payee = payees.find((p) => p.id === reminder.payeeId);
  if (!payee) return { kind: "noPayee" };
  return reminder.amountPaise ? { kind: "confirm", payee, amountPaise: reminder.amountPaise } : { kind: "askAmount", payee };
}

const defaultId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function createReminderStore(store: KeyValueStore = asyncStore, newId: () => string = defaultId) {
  const queue = createWriteQueue();

  async function read(): Promise<{ reminders: Reminder[]; corrupt: boolean; raw: string | null }> {
    const raw = await store.getItem(KEY);
    if (raw === null) return { reminders: [], corrupt: false, raw };
    let list: unknown;
    try {
      list = JSON.parse(raw);
    } catch {
      return { reminders: [], corrupt: true, raw };
    }
    if (!Array.isArray(list)) return { reminders: [], corrupt: true, raw };
    const reminders: Reminder[] = [];
    for (const item of list) {
      const parsed = ReminderSchema.safeParse(item);
      if (parsed.success) reminders.push(parsed.data);
    }
    return { reminders, corrupt: reminders.length !== list.length, raw };
  }

  async function write(reminders: Reminder[], previous: { corrupt: boolean; raw: string | null }) {
    if (previous.corrupt && previous.raw !== null) await store.setItem(BACKUP_KEY, previous.raw);
    await store.setItem(KEY, JSON.stringify(reminders));
  }

  return {
    async list(): Promise<Reminder[]> {
      return (await read()).reminders;
    },

    async get(id: string): Promise<Reminder | null> {
      return (await read()).reminders.find((r) => r.id === id) ?? null;
    },

    add(input: NewReminder, now: number): Promise<{ ok: true; reminder: Reminder } | { ok: false; error: "INVALID" | "TOO_MANY" }> {
      return queue(async () => {
        const parsed = ReminderSchema.safeParse({ id: newId(), ...input, createdAt: now });
        if (!parsed.success || parsed.data.nextAt <= now) return { ok: false, error: "INVALID" };
        const current = await read();
        if (current.reminders.length >= MAX_REMINDERS) return { ok: false, error: "TOO_MANY" };
        await write([...current.reminders, parsed.data], current);
        return { ok: true, reminder: parsed.data };
      });
    },

    remove(id: string): Promise<void> {
      return queue(async () => {
        const current = await read();
        await write(current.reminders.filter((r) => r.id !== id), current);
      });
    },

    // App start (see catchUp). Returns the reminders that are left.
    catchUp(now: number): Promise<Reminder[]> {
      return queue(async () => {
        const current = await read();
        const { reminders } = catchUp(current.reminders, now);
        await write(reminders, current);
        return reminders;
      });
    },

    // It was tapped: a one-time reminder is removed, a monthly one moves on. Returns the updated reminder.
    fired(id: string, now: number): Promise<Reminder | null> {
      return queue(async () => {
        const current = await read();
        const r = current.reminders.find((x) => x.id === id);
        if (!r) return null;
        const nextAt = nextAfterFired(r.when, now);
        const updated = nextAt === null ? null : { ...r, nextAt };
        await write(
          current.reminders.flatMap((x) => (x.id !== id ? [x] : updated ? [updated] : [])),
          current,
        );
        return updated;
      });
    },
  };
}
