// The family helper (M17, docs/VOICE-PLAN.md): one trusted person FlowPay offers to call when she is
// stuck (a red card, or Home not understanding her twice). Name + phone number in SecureStore, on the
// phone only; never sent to the server or the AI. Calling only opens the phone's dialer (tel:); she
// still presses call. Saving, changing or removing the helper needs the fingerprint/PIN (Settings).
// Pure, except the store, which takes a KeyValueStore.
import { z } from "zod";
import { MAX_NAME_LENGTH } from "./payees";
import { normalizePhone } from "./phone";
import { secureStore, type KeyValueStore } from "./storage";
import { CANCEL_PHRASES, LISTEN_WINDOW_MS, STRICT_YES, normalizeUtterance } from "./voiceConfirm";

const KEY = "flowpay.helper.v1";

export const HelperSchema = z.object({
  name: z.string().min(1).max(MAX_NAME_LENGTH),
  phone: z.string().regex(/^\+91[6-9]\d{9}$/),
});
export type Helper = z.infer<typeof HelperSchema>;

export type HelperResult = { ok: true; helper: Helper } | { ok: false; error: "INVALID_NAME" | "INVALID_PHONE" };

export function makeHelper(input: { name: string; phone: string }): HelperResult {
  const name = input.name.trim();
  if (!name || name.length > MAX_NAME_LENGTH) return { ok: false, error: "INVALID_NAME" };
  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, error: "INVALID_PHONE" };
  return { ok: true, helper: { name, phone } };
}

export const telUri = (helper: Helper) => `tel:${helper.phone}`;

// Unreadable or invalid data reads as "no helper": FlowPay then simply doesn't offer the call.
export function createHelperStore(store: KeyValueStore = secureStore) {
  return {
    async load(): Promise<Helper | null> {
      try {
        const raw = await store.getItem(KEY);
        if (!raw) return null;
        const parsed = HelperSchema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
    save: (helper: Helper) => store.setItem(KEY, JSON.stringify(HelperSchema.parse(helper))),
    clear: () => store.removeItem(KEY),
  };
}

// The answer to "Should I call Beta?". Code, never the AI. Same window, echo guard and phrase lists
// as the Confirm card (lib/voiceConfirm); any "no" word without a yes means no.
const nfc = (words: readonly string[]) => new Set(words.map((w) => w.normalize("NFC")));
const STRICT = nfc(STRICT_YES);
const CANCEL = nfc(CANCEL_PHRASES);
const YES_WORDS = nfc(["yes", "haan", "ok", "हाँ"]);
const NO_WORDS = nfc(["no", "not", "nahi", "nahin", "mat", "cancel", "stop", "नहीं", "मत"]);
const SOFTENER = nfc(["na", "ना"]);

export function decideHelpVoice(heard: {
  transcript: string;
  listenStartedAt: number;
  resultAt: number;
  lastSpoken: string;
}): "call" | "no" | "ignore" | "notClear" {
  if (heard.resultAt - heard.listenStartedAt > LISTEN_WINDOW_MS) return "ignore";
  const normalized = normalizeUtterance(heard.transcript);
  if (!normalized) return "ignore";
  const words = normalized.split(" ");
  if (words.length >= 2 && normalizeUtterance(heard.lastSpoken).includes(normalized)) return "ignore";
  const kept = words.length > 1 && SOFTENER.has(words.at(-1)!) ? words.slice(0, -1) : words;
  const phrase = kept.join(" ");
  if (CANCEL.has(phrase)) return "no";
  if (STRICT.has(phrase)) return "call";
  const saysNo = kept.some((w) => NO_WORDS.has(w));
  const saysYes = kept.some((w) => YES_WORDS.has(w));
  return saysNo && !saysYes ? "no" : "notClear";
}
