// M15 preferences: how the app talks. Stored on the phone (AsyncStorage + Zod); unreadable data falls
// back to the defaults. The agent's set_preference only carries fixed key/value pairs (checked on the
// server and again here). The mic language itself stays in voice.ts (since M8b).
import { z } from "zod";

import type { SpeechLang } from "./speech";
import { asyncStore, type KeyValueStore } from "./storage";
import type { VoiceLang } from "./voice";

const KEY = "flowpay.prefs.v1";

export const PrefsSchema = z.object({
  replyLanguage: z.enum(["auto", "en", "hi"]), // auto = the mic's language (M11 behaviour)
  speakReplies: z.boolean(), // off = Home and the receipt only show; the Confirm card always asks aloud
});
export type Prefs = z.infer<typeof PrefsSchema>;
export const DEFAULT_PREFS: Prefs = { replyLanguage: "auto", speakReplies: true };

export type PreferenceChange = { key: "reply_language" | "speak_replies" | "mic_language"; value: string };

// What a change means: new prefs and/or a new mic language. null = not a valid pair (nothing changes).
export function applyPreference(prefs: Prefs, change: PreferenceChange): { prefs: Prefs; micLang?: VoiceLang } | null {
  const { key, value } = change;
  if (key === "reply_language") {
    const replyLanguage = value === "english" ? "en" : value === "hindi" ? "hi" : value === "auto" ? "auto" : null;
    return replyLanguage ? { prefs: { ...prefs, replyLanguage } } : null;
  }
  if (key === "speak_replies") {
    return value === "on" || value === "off" ? { prefs: { ...prefs, speakReplies: value === "on" } } : null;
  }
  if (key === "mic_language") {
    return value === "english" ? { prefs, micLang: "en-IN" } : value === "hindi" ? { prefs, micLang: "hi-IN" } : null;
  }
  return null;
}

// Which language to speak. Hindi only with a Hindi voice on the phone (never silent or garbled).
export function pickSpeechLang(p: { replyLanguage: Prefs["replyLanguage"]; micLang: VoiceLang; hasHindiVoice: boolean }): SpeechLang {
  const wantHindi = p.replyLanguage === "hi" || (p.replyLanguage === "auto" && p.micLang === "hi-IN");
  return wantHindi && p.hasHindiVoice ? "hi-IN" : "en-IN";
}

export function createPreferenceStore(store: KeyValueStore = asyncStore) {
  let current: Prefs = DEFAULT_PREFS;
  return {
    get: () => current,
    async load(): Promise<Prefs> {
      try {
        const raw = await store.getItem(KEY);
        const parsed = raw ? PrefsSchema.safeParse(JSON.parse(raw)) : null;
        current = parsed?.success ? parsed.data : DEFAULT_PREFS;
      } catch {
        current = DEFAULT_PREFS;
      }
      return current;
    },
    async set(prefs: Prefs): Promise<void> {
      current = PrefsSchema.parse(prefs);
      await store.setItem(KEY, JSON.stringify(current)).catch(() => {}); // not remembering it is harmless
    },
  };
}
