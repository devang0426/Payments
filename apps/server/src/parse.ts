// /parse logic: AI extraction → Zod → hallucination guard → parseAmount (our code, never the AI's number).
import { z } from "zod";
import { parseAmount } from "./amount.js";
import type { Extractor } from "./llm.js";

export const MAX_TEXT_LENGTH = 300;

export const ParseRequest = z.object({
  text: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
});

// Extra keys from the model (e.g. a number it computed) are stripped and never used.
const AiOutput = z.object({
  name: z.string().max(100).nullable(),
  amountText: z.string().max(MAX_TEXT_LENGTH).nullable(),
});

export type ParseError = "NO_NAME" | "NO_AMOUNT" | "AI_FAILED" | "BAD_INPUT";

export type ParseResponse =
  | { ok: true; name: string; amount: { kind: "paise"; paise: number } | { kind: "last" } }
  | { ok: false; error: ParseError };

export const LAST_MARKER = "LAST";

// Phrases meaning "the same amount as last time" (input is already normalized/lowercase).
const SAME_AS_LAST_TIME = [
  /\bpic?hh?(li|le)\s+baar\b/, // pichhli / pichli / pichhle baar
  /\butn[ae]\s+hi\b/, // utna hi / utne hi
  /\bsame as (last time|before)\b/,
  /\blast time\b/,
  /\bpehle\s+jitn[ae]\b/, // pehle jitna
  /पिछली बार|पिछले बार|उतना ही|उतने ही|पहले जितना/,
];

export function saysSameAsLastTime(normalizedInput: string): boolean {
  return SAME_AS_LAST_TIME.some((re) => re.test(normalizedInput));
}

// Same normalization for input and AI values: Unicode NFC, lowercase, collapsed whitespace.
export function normalize(s: string): string {
  return s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

export async function parseCommand(text: string, extract: Extractor): Promise<ParseResponse> {
  let raw: unknown;
  try {
    raw = await extract(text);
  } catch {
    return { ok: false, error: "AI_FAILED" };
  }

  const ai = AiOutput.safeParse(raw);
  if (!ai.success) return { ok: false, error: "AI_FAILED" };

  const input = normalize(text);
  const name = ai.data.name === null ? "" : normalize(ai.data.name);
  const amountText = ai.data.amountText === null ? "" : normalize(ai.data.amountText);

  // The AI may only copy from the input; anything it invented is rejected.
  if (!name || !input.includes(name)) return { ok: false, error: "NO_NAME" };

  // "Same as last time": the AI's exact marker counts only if the user really said such a phrase.
  // The phone looks up the amount from its own history; the server never sees it.
  if (ai.data.amountText?.trim() === LAST_MARKER) {
    return saysSameAsLastTime(input)
      ? { ok: true, name: ai.data.name!.trim(), amount: { kind: "last" } }
      : { ok: false, error: "NO_AMOUNT" };
  }

  if (!amountText || !input.includes(amountText)) return { ok: false, error: "NO_AMOUNT" };

  const amount = parseAmount(amountText);
  if (!amount.ok) return { ok: false, error: "NO_AMOUNT" };

  return { ok: true, name: ai.data.name!.trim(), amount: { kind: "paise", paise: amount.paise } };
}
