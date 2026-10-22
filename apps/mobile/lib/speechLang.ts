// Which language the app speaks (lib/preferences pickSpeechLang): the reply-language preference (M15;
// default "like the mic", the M11 behaviour), and Hindi only when the phone has a Hindi
// text-to-speech voice; otherwise English, so the app is never silent or garbled.
import * as Speech from "expo-speech";

import { pickSpeechLang } from "./preferences";
import type { SpeechLang } from "./speech";
import { prefsStore } from "./stores";
import { getVoiceLang } from "./voice";

let hindiVoiceFound = false; // cached once found; Android can list no voices right after start

export async function hasHindiVoice(): Promise<boolean> {
  if (hindiVoiceFound) return true;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    hindiVoiceFound = voices.some((v) => v.language.replace(/_/g, "-").toLowerCase() === "hi-in");
  } catch {
    hindiVoiceFound = false;
  }
  return hindiVoiceFound;
}

export async function speechLanguage(): Promise<SpeechLang> {
  const { replyLanguage } = prefsStore.get();
  const micLang = getVoiceLang();
  const wantsHindi = replyLanguage === "hi" || (replyLanguage === "auto" && micLang === "hi-IN");
  return pickSpeechLang({ replyLanguage, micLang, hasHindiVoice: wantsHindi ? await hasHindiVoice() : false });
}
