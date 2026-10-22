// Voice confirmation on the Confirm card (CLAUDE.md rule 8; full spec + case numbers in
// docs/AGENT.md "Voice confirmation"). Pure. Every decision here is code, never the AI.
// decideVoice first decides on its own (late/stale/echo, cancel, pause, strict yes). Only when the
// speech may be a change does it return { kind: "askServer" }; the screen then calls /turn, resolves
// the payee on the phone and calls decideVoice again with the outcome.

export const LISTEN_WINDOW_MS = 5000;
export const MAX_REASKS = 2;

// The whole utterance (after normalization) must be one of these.
export const STRICT_YES = [
  "yes", "yes please", "yes send", "yes send it", "haan", "haan ji", "haanji", "haan bhejo", "haan bhej do",
  "ok bhejo", "हाँ", "हाँ जी", "हाँ भेजो", "हाँ भेज दो",
] as const;
export const CANCEL_PHRASES = [
  "nahi", "nahin", "no", "na", "cancel", "nahi bhejo", "nahin bhejo", "mat bhejo", "cancel karo", "rehne do",
  "rahne do", "chhodo", "chodo", "नहीं", "ना", "नहीं भेजो", "मत भेजो", "कैंसल करो", "रहने दो", "छोड़ो", "छोडो",
] as const;
export const PAUSE_PHRASES = ["ruko", "rukiye", "wait", "रुको", "रुकिए"] as const;

// "Yes + change" only counts when one of these is the FIRST word.
const YES_WORDS = ["yes", "haan", "ok", "हाँ"];
// Any of these vetoes a confirm. "na" is handled separately (only alone or before a verb).
const NEGATIONS = ["no", "not", "nahi", "nahin", "mat", "ruko", "rukiye", "wait", "cancel", "stop", "नहीं", "मत", "रुको", "रुकिए"];
const VERBS = ["bhej", "bhejo", "bhejna", "kar", "karo", "karna", "do", "dena", "भेज", "भेजो", "कर", "करो", "दो"];
const NA = ["na", "ना"];

// Matched after Unicode NFC, like the transcript (Devanagari nukta letters change under NFC).
const set = (words: readonly string[]) => new Set(words.map((w) => w.normalize("NFC")));
const STRICT = set(STRICT_YES);
const CANCEL = set(CANCEL_PHRASES);
const PAUSE = set(PAUSE_PHRASES);
const YES = set(YES_WORDS);
const NEG = set(NEGATIONS);
const VERB = set(VERBS);
const SOFT = set(NA);

export function normalizeUtterance(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/['’]/g, "") // "it's" → "its"
    .replace(/[.,!?।"“”…]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w === "हां" ? "हाँ" : w)) // recognizers write both
    .join(" ");
}

export type VoiceCard = {
  txnRef: string;
  payeeId: string;
  paise: number;
  tone: "green" | "amber" | "red";
  offerPaise?: number; // red card only: a phone-computed alternative ("Send ₹2,000 instead?")
  amberStep?: 1 | 2; // amber card: 2 after "Are you sure? Say yes again."
  reasks: number; // "It's already ₹X" re-asks so far on this card
};

export type VoiceInput = {
  card: VoiceCard; // the card that opened the mic
  currentTxnRef: string; // the card on screen now
  used: boolean; // this card's lock is already taken (confirmed or cancelled)
  heard: { transcript: string; forTxnRef: string; listenStartedAt: number; resultAt: number; lastSpoken: string };
};

// What /turn + the phone's payee resolution made of the speech.
export type TurnOutcome =
  | { kind: "failed" } // server or network down
  | { kind: "change"; payeeId: string; paise: number } // the draft after the change, resolved on the phone
  | { kind: "relative" } // "100 kam kar do": no amount is worked out
  | { kind: "other" };

export type VoiceDecision =
  | { kind: "ignore" }
  | { kind: "cancel" } // speak "Cancelled", close the card, lock the txnRef
  | { kind: "pause" } // speak "Okay, tap the mic when you're ready.", mic closed
  | { kind: "confirm" }
  | { kind: "askAgain" } // amber: speak "Are you sure? Say yes again." and listen again
  | { kind: "newCard"; payeeId: string; paise: number }
  | { kind: "reask"; paise: number } // speak "It's already ₹X. Say yes to send." and listen again
  | { kind: "tapOnly" } // speak "Please tap Yes to send", mic closed
  | { kind: "notClear"; hint?: "fullAmount" }
  | { kind: "askServer" };

const IGNORE = { kind: "ignore" } as const;
const CONFIRM = { kind: "confirm" } as const;
const NOT_CLEAR = { kind: "notClear" } as const;
const ASK_AGAIN = { kind: "askAgain" } as const;

// A trailing "na" is a softener ("haan bhejo na"), but "na" alone means no.
function dropSoftener(words: string[]): string[] {
  return words.length > 1 && SOFT.has(words.at(-1)!) ? words.slice(0, -1) : words;
}

function hasNegation(words: string[]): boolean {
  return words.some(
    (w, i) => NEG.has(w) || (SOFT.has(w) && (words.length === 1 || VERB.has(words[i + 1] ?? ""))),
  );
}

// Our own speech heard back through the mic. One word is never treated as echo ("yes" after "Say yes").
function isEcho(normalized: string, lastSpoken: string): boolean {
  const spoken = normalizeUtterance(lastSpoken);
  if (!spoken || normalized.split(" ").length < 2) return false;
  return spoken.includes(normalized) || normalized.includes(spoken);
}

export function decideVoice(input: VoiceInput, turn?: TurnOutcome): VoiceDecision {
  const { card, heard } = input;

  // 1. Late, stale, empty or echoed results do nothing.
  if (input.used || heard.forTxnRef !== card.txnRef || heard.forTxnRef !== input.currentTxnRef) return IGNORE;
  if (heard.resultAt - heard.listenStartedAt > LISTEN_WINDOW_MS) return IGNORE;
  const normalized = normalizeUtterance(heard.transcript);
  if (!normalized || isEcho(normalized, heard.lastSpoken)) return IGNORE;

  const words = dropSoftener(normalized.split(" "));
  const phrase = words.join(" ");

  // 2–3. Cancel and pause: on any card, no server call.
  if (CANCEL.has(phrase)) return { kind: "cancel" };
  if (PAUSE.has(phrase)) return { kind: "pause" };

  // 4. Strict yes.
  if (STRICT.has(phrase)) {
    if (card.tone === "red") {
      return card.offerPaise ? { kind: "newCard", payeeId: card.payeeId, paise: card.offerPaise } : NOT_CLEAR;
    }
    if (card.tone === "amber" && (card.amberStep ?? 1) === 1) return ASK_AGAIN;
    return CONFIRM;
  }

  // 5. Maybe a change: needs the server's reading.
  if (!turn) return { kind: "askServer" };
  if (turn.kind === "failed" || turn.kind === "other") return NOT_CLEAR;
  if (turn.kind === "relative") return { kind: "notClear", hint: "fullAmount" };

  if (turn.payeeId !== card.payeeId || turn.paise !== card.paise) {
    return { kind: "newCard", payeeId: turn.payeeId, paise: turn.paise };
  }

  // Same payee and amount as the card.
  if (hasNegation(words) || card.tone === "red") return NOT_CLEAR;
  if (!YES.has(words[0]!)) {
    return card.reasks < MAX_REASKS ? { kind: "reask", paise: card.paise } : { kind: "tapOnly" };
  }
  // "Yes + change" needs an actual change after the yes-word: "ok" or "haan haan" alone is not one,
  // whatever the server made of it.
  if (words.slice(1).every((w) => YES.has(w))) return NOT_CLEAR;
  if (card.tone === "amber") return (card.amberStep ?? 1) === 1 ? ASK_AGAIN : NOT_CLEAR;
  return CONFIRM;
}

// The reminder card (M13): a strict yes saves, cancel/pause as on the Confirm card, anything else is
// "not clear" (no server call: a change is said again on Home). Same timing and echo rules. Saving a
// reminder never pays anything.
export type SaveVoiceInput = {
  cardId: string; // the reminder card that opened the mic
  currentId: string; // the card on screen now
  used: boolean; // already saved or cancelled
  heard: { transcript: string; forId: string; listenStartedAt: number; resultAt: number; lastSpoken: string };
};

export type SaveVoiceDecision = { kind: "save" | "cancel" | "pause" | "ignore" | "notClear" };

export function decideSaveVoice(input: SaveVoiceInput): SaveVoiceDecision {
  const { heard } = input;
  if (input.used || heard.forId !== input.cardId || heard.forId !== input.currentId) return IGNORE;
  if (heard.resultAt - heard.listenStartedAt > LISTEN_WINDOW_MS) return IGNORE;
  const normalized = normalizeUtterance(heard.transcript);
  if (!normalized || isEcho(normalized, heard.lastSpoken)) return IGNORE;
  const phrase = dropSoftener(normalized.split(" ")).join(" ");
  if (CANCEL.has(phrase)) return { kind: "cancel" };
  if (PAUSE.has(phrase)) return { kind: "pause" };
  if (STRICT.has(phrase)) return { kind: "save" };
  return { kind: "notClear" };
}
