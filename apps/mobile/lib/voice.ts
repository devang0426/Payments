// In-app speech-to-text (expo-speech-recognition). Needs a development/release build: in Expo Go
// the native module is missing, so `voiceAvailable()` is false and the UI hides the mic.
// Audio is handled by the phone's speech service; FlowPay only receives the text.
import type { ExpoSpeechRecognitionModule as ModuleType } from "expo-speech-recognition";

export type VoiceLang = "en-IN" | "hi-IN";

let mod: typeof ModuleType | null = null;
try {
  mod = (require("expo-speech-recognition") as { ExpoSpeechRecognitionModule: typeof ModuleType })
    .ExpoSpeechRecognitionModule;
} catch {
  mod = null; // Expo Go: no native module
}

export function voiceAvailable(): boolean {
  try {
    return !!mod && mod.isRecognitionAvailable();
  } catch {
    return false;
  }
}

// Shared choice for the Home mic and the voice "Yes" (in-memory).
let lang: VoiceLang = "en-IN";
export const getVoiceLang = () => lang;
export const setVoiceLang = (value: VoiceLang) => {
  lang = value;
};

export type ListenResult =
  | { ok: true; transcript: string }
  | { ok: false; reason: "unavailable" | "denied" | "no-speech" | "error" };

let active: { cancel: () => void } | null = null;

// Listen once. onPartial gets the live transcript. Resolves on the final result, silence, error,
// timeout or stopListening().
export async function listenOnce(opts: {
  lang?: VoiceLang;
  onPartial?: (text: string) => void;
  timeoutMs?: number;
}): Promise<ListenResult> {
  if (!mod || !voiceAvailable()) return { ok: false, reason: "unavailable" };
  const m = mod;

  try {
    const permission = await m.requestPermissionsAsync();
    if (!permission.granted) return { ok: false, reason: "denied" };
  } catch {
    return { ok: false, reason: "error" };
  }

  stopListening();
  return new Promise<ListenResult>((resolve) => {
    let latest = "";
    let done = false;
    const subs: { remove: () => void }[] = [];

    const finish = (result: ListenResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      subs.forEach((s) => s.remove());
      if (active?.cancel === cancel) active = null;
      resolve(result);
    };
    const cancel = () => {
      try {
        m.abort();
      } catch {}
      finish(latest ? { ok: true, transcript: latest } : { ok: false, reason: "no-speech" });
    };

    subs.push(
      m.addListener("result", (event) => {
        latest = event.results[0]?.transcript ?? latest;
        opts.onPartial?.(latest);
        if (event.isFinal) finish(latest.trim() ? { ok: true, transcript: latest } : { ok: false, reason: "no-speech" });
      }),
      m.addListener("error", (event) => {
        const silent = event.error === "no-speech" || event.error === "speech-timeout" || event.error === "aborted";
        finish({ ok: false, reason: silent ? "no-speech" : "error" });
      }),
      m.addListener("end", () => {
        finish(latest.trim() ? { ok: true, transcript: latest } : { ok: false, reason: "no-speech" });
      }),
    );

    const timer = setTimeout(() => {
      try {
        m.stop();
      } catch {}
      setTimeout(cancel, 1500); // give the recognizer a moment to deliver the final result
    }, opts.timeoutMs ?? 10_000);

    active = { cancel };
    try {
      m.start({ lang: opts.lang ?? lang, interimResults: true, continuous: false, maxAlternatives: 1 });
    } catch {
      finish({ ok: false, reason: "error" });
    }
  });
}

export function stopListening(): void {
  active?.cancel();
  active = null;
}
