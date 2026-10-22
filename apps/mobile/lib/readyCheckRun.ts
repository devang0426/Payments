// Gathers the Ready check facts on the phone. Every check catches its own errors, so one failing
// check shows ❌ instead of breaking the screen. The /parse probe is a fixed phrase, never user text.
import * as Speech from "expo-speech";
import { Linking } from "react-native";

import { checkHealth, parseText } from "./api";
import { contactsPermission } from "./contacts";
import type { HistoryEntry } from "./history";
import type { ReadyFacts } from "./readyCheck";
import { isRehearsalRef } from "./rehearsal";
import { notificationPermission } from "./remindersNative";
import { DAILY_LIMIT_PAISE, sentTodayPaise } from "./rules";
import { helperStore, historyStore, payeeStore, rehearsal } from "./stores";
import { micPermission } from "./voice";

const PROBE_TEXT = "Mummy ko paanch sau bhejo";
const PROBE_PAISE = 50000;

async function probeParse(): Promise<ReadyFacts["parse"]> {
  const result = await parseText(PROBE_TEXT);
  if (!result.ok) return "failed";
  return result.amount.kind === "paise" && result.amount.paise === PROBE_PAISE ? "ok" : "wrong";
}

// Android's TTS engine can return an empty list right after start, so ask twice.
async function hasEnInVoice(): Promise<boolean> {
  const isEnIn = (language: string) => language.replace(/_/g, "-").toLowerCase() === "en-in";
  try {
    let voices = await Speech.getAvailableVoicesAsync();
    if (voices.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      voices = await Speech.getAvailableVoicesAsync();
    }
    return voices.some((v) => isEnIn(v.language));
  } catch {
    return false;
  }
}

async function canOpenUpi(): Promise<boolean> {
  try {
    return await Linking.canOpenURL("upi://pay");
  } catch {
    return false;
  }
}

export async function gatherReadyFacts(now: number = Date.now()): Promise<ReadyFacts> {
  const health = await checkHealth();
  const unreadable = { entries: [] as HistoryEntry[], corrupt: true };
  const [parse, mic, contacts, ttsEnIn, upiApp, payees, history, rehearsalOn, notifications, helper] = await Promise.all([
    health === "ok" ? probeParse() : Promise.resolve("skipped" as const),
    micPermission(),
    contactsPermission(),
    hasEnInVoice(),
    canOpenUpi(),
    payeeStore
      .load()
      .then((p) => p.payees.length)
      .catch(() => 0),
    historyStore.load().catch(() => unreadable),
    rehearsal.load(),
    notificationPermission(),
    helperStore.load(),
  ]);
  return {
    health,
    parse,
    mic,
    contacts,
    ttsEnIn,
    upiApp,
    payees,
    historyReadable: !history.corrupt,
    remainingPaise: history.corrupt ? 0 : Math.max(0, DAILY_LIMIT_PAISE - sentTodayPaise(history.entries, now)),
    rehearsalOn,
    rehearsalEntries: history.entries.filter((e) => isRehearsalRef(e.txnRef)).length,
    notifications,
    helperSaved: !!helper,
  };
}
