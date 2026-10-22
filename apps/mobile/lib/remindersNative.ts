// Local reminder notifications (expo-notifications, M13). Local only: no push, no server, nothing
// leaves the phone. Works in Expo Go on Android; a development/release build needs a rebuild to
// include the native module. Until then it is missing and reminders say "not available" (no crash).
// The notification carries only the reminder id; the app looks the reminder up when it's tapped.
import type * as NotificationsType from "expo-notifications";

import type { Payee } from "./payees";
import { notificationFor, notificationIdFor, type Reminder } from "./reminders";

type Mod = typeof NotificationsType;
let N: Mod | null = null;
try {
  N = require("expo-notifications") as Mod;
} catch {
  N = null; // a build without the native module
}

const CHANNEL_ID = "reminders";

export const notificationsAvailable = () => !!N;

// For the Ready check: the permission as it is now, without asking.
export async function notificationPermission(): Promise<"granted" | "denied" | "undetermined" | "unavailable"> {
  if (!N) return "unavailable";
  try {
    const p = await N.getPermissionsAsync();
    return p.granted ? "granted" : p.canAskAgain ? "undetermined" : "denied";
  } catch {
    return "unavailable";
  }
}

// Android 13+ asks for the permission only after a channel exists, so the channel comes first.
export async function ensureNotificationPermission(): Promise<"granted" | "denied" | "unavailable"> {
  if (!N) return "unavailable";
  try {
    await N.setNotificationChannelAsync(CHANNEL_ID, { name: "Payment reminders", importance: N.AndroidImportance.HIGH });
    const current = await N.getPermissionsAsync();
    if (current.granted) return "granted";
    if (!current.canAskAgain) return "denied";
    return (await N.requestPermissionsAsync()).granted ? "granted" : "denied";
  } catch {
    return "unavailable";
  }
}

// Schedules (or re-schedules) the reminder's one notification at reminder.nextAt. Android may deliver
// it a little late ("best effort", no exact-alarm permission); fine for a reminder.
export async function scheduleReminder(reminder: Reminder, payee: Pick<Payee, "displayName">): Promise<boolean> {
  if (!N) return false;
  try {
    const { title, body, data } = notificationFor(reminder, payee);
    const identifier = notificationIdFor(reminder.id);
    await N.cancelScheduledNotificationAsync(identifier).catch(() => {});
    await N.scheduleNotificationAsync({
      identifier,
      content: { title, body, data },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: reminder.nextAt, channelId: CHANNEL_ID },
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelReminderNotification(reminderId: string): Promise<void> {
  if (!N) return;
  await N.cancelScheduledNotificationAsync(notificationIdFor(reminderId)).catch(() => {});
}

const reminderIdOf = (response: NotificationsType.NotificationResponse | null): string | null => {
  const id = response?.notification.request.content.data?.reminderId;
  return typeof id === "string" && id ? id : null;
};

// Show reminders while the app is open too, and call onOpen(reminderId) when one is tapped, including
// the tap that started the app. Returns the clean-up.
export function handleReminderTaps(onOpen: (reminderId: string) => void): () => void {
  if (!N) return () => {};
  const mod = N;
  // A tap that starts the app can arrive both ways; handle each notification once.
  const handled = new Set<string>();
  const open = (response: NotificationsType.NotificationResponse | null) => {
    const id = reminderIdOf(response);
    if (!response || !id) return;
    const key = `${response.notification.request.identifier}:${response.notification.date}`;
    if (handled.has(key)) return;
    handled.add(key);
    mod.clearLastNotificationResponseAsync().catch(() => {});
    onOpen(id);
  };
  try {
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true, // on Android, no sound = no banner
        shouldSetBadge: false,
      }),
    });
    const sub = mod.addNotificationResponseReceivedListener(open);
    mod.getLastNotificationResponseAsync().then(open).catch(() => {});
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
