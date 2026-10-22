// /turn logic: one step of a conversation. The AI picks ONE action and copies spans from the user's
// words; everything else is code. Names must appear in what the user said (never only in the app's
// questions); amounts must appear in the LATEST user message and are parsed by parseAmount (never the
// AI's number); a relative amount ("100 kam") is never worked out by anyone: the app asks again.
import { z } from "zod";
import { parseAmount } from "./amount.js";
import type { ConversationTurn, TurnExtractor } from "./llm.js";
import { LAST_MARKER, MAX_TEXT_LENGTH, normalize, saysSameAsLastTime } from "./parse.js";
import { findPeriodIn, parsePeriod, parseWhen, type Period, type When } from "./when.js";

export const MAX_TURNS = 12;
export const MAX_USER_TURNS = 6;

const Turn = z.strictObject({
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
});

export const TurnRequest = z
  .strictObject({
    turns: z.array(Turn).min(1).max(MAX_TURNS),
    awaiting: z.enum(["amount", "payee", "draft"]).optional(),
  })
  .refine((r) => r.turns.at(-1)?.role === "user", "the last turn must be the user's")
  .refine((r) => r.turns.filter((t) => t.role === "user").length <= MAX_USER_TURNS, "too many user turns");
export type TurnRequest = z.infer<typeof TurnRequest>;

// Extra keys from the model (e.g. a number it computed) are stripped and never used.
export const AiTurn = z.object({
  action: z.enum(["pay", "set_amount", "set_payee", "show_spending", "create_reminder", "cancel", "unknown"]),
  nameText: z.string().max(100).nullable(),
  amountText: z.string().max(MAX_TEXT_LENGTH).nullable(),
  // M13 spans. Optional, so a model that leaves them out still works.
  periodText: z.string().max(100).nullable().optional(),
  whenText: z.string().max(100).nullable().optional(),
});

type Amount = { kind: "paise"; paise: number } | { kind: "last" };

export type TurnResponse =
  | { ok: true; action: "pay"; name?: string; amount?: Amount }
  | { ok: true; action: "set_amount"; amount: Amount }
  | { ok: true; action: "set_payee"; name: string }
  | { ok: true; action: "show_spending"; name?: string; period: Period | "all" }
  | { ok: true; action: "create_reminder"; name: string; amount?: Amount; when: When }
  | { ok: true; action: "cancel" | "unknown" | "ask_exact" }
  | { ok: false; error: "AI_FAILED" | "BAD_INPUT" };

// Words that make an amount relative to another one. Matched as whole words in the latest message.
const RELATIVE_WORDS = new Set(
  [
    "kam", "kum", "zyada", "zyaada", "jyada", "jada", "aur", "double", "dugna", "doguna", "half", "aadha",
    "adha", "minus", "plus", "less", "more", "extra", "कम", "ज़्यादा", "ज्यादा", "जादा", "और", "आधा", "दुगना", "डबल",
  ].map((w) => w.normalize("NFC")),
);

export function saysRelativeAmount(normalizedText: string): boolean {
  return normalizedText
    .replace(/[.,!?।"'“”…]/g, " ")
    .split(/\s+/)
    .some((word) => RELATIVE_WORDS.has(word));
}

const UNKNOWN = { ok: true, action: "unknown" } as const;

export async function runTurn(req: TurnRequest, extract: TurnExtractor): Promise<TurnResponse> {
  const turns: ConversationTurn[] = req.turns;
  let raw: unknown;
  try {
    raw = await extract(req.awaiting ? { turns, awaiting: req.awaiting } : { turns });
  } catch {
    return { ok: false, error: "AI_FAILED" };
  }
  const ai = AiTurn.safeParse(raw);
  if (!ai.success) return { ok: false, error: "AI_FAILED" };
  return checkAiTurn(ai.data, turns);
}

export type CheckedTurn = Exclude<TurnResponse, { ok: false }>;

// The checks behind /turn, also used by /agent (M14) for each tool call. Pure.
// scope (M14, several payments in one message): the part of the latest message that belongs to this
// payment. The relative-amount check and the amount span look only there, so "Mummy ko 500 aur Papa
// ko 300" can't give Mummy Papa's 300, and its "aur" doesn't read as "500 more".
export function checkAiTurn(
  aiTurn: z.infer<typeof AiTurn>,
  turns: ConversationTurn[],
  scope?: string,
): CheckedTurn {
  const { action, nameText, amountText, periodText, whenText } = aiTurn;

  if (action === "cancel" || action === "unknown") return { ok: true, action };

  const userTexts = turns.filter((t) => t.role === "user").map((t) => normalize(t.text));
  const latest = userTexts.at(-1)!;
  const amountScope = scope ?? latest;

  if ((action === "pay" || action === "set_amount" || action === "create_reminder") && saysRelativeAmount(amountScope)) {
    return { ok: true, action: "ask_exact" };
  }

  // The name: anything the AI didn't copy from the user's own words makes the whole step unknown.
  let name: string | undefined;
  if (nameText?.trim()) {
    const spoken = normalize(nameText);
    if (!userTexts.some((u) => u.includes(spoken))) return UNKNOWN;
    name = nameText.trim();
  }

  // A spending question has no amount (any the AI copied is ignored). The period comes from the latest
  // message: the AI's span if it is really there, else the one period code finds in the user's own
  // words (the AI sometimes copies "aaj" as "आज"). One the user didn't say makes the step unknown;
  // none at all = all time. The phone works out the dates and the total.
  if (action === "show_spending") {
    const inText = findPeriodIn(latest);
    let period: Period | "all" = inText ?? "all";
    if (periodText?.trim()) {
      const parsed = parsePeriod(periodText);
      if (latest.includes(normalize(periodText)) && parsed) period = parsed;
      else if (!parsed || parsed !== inText) return UNKNOWN;
    }
    return { ok: true, action, ...(name ? { name } : {}), period };
  }

  // The amount: only from the latest message. One copied from an EARLIER user message is dropped (the
  // phone already has that amount in its draft, parsed back then); one the user never said makes the
  // whole step unknown. "LAST" only counts if the user really said such a phrase.
  let amount: Amount | undefined;
  if (amountText?.trim()) {
    if (amountText.trim() === LAST_MARKER) {
      if (saysSameAsLastTime(latest)) amount = { kind: "last" };
      else if (!userTexts.some(saysSameAsLastTime)) return UNKNOWN;
    } else {
      const span = normalize(amountText);
      if (amountScope.includes(span)) {
        const parsed = parseAmount(span);
        if (parsed.ok) amount = { kind: "paise", paise: parsed.paise };
        // Unreadable ("bahut saare"): dropped, so the app asks "How much?".
      } else if (scope !== undefined || !userTexts.some((u) => u.includes(span))) {
        // Several payments: an amount from another payment's part is never taken.
        return UNKNOWN;
      }
    }
  }

  // A name and an amount both in the latest message are a payment, whatever the AI called it
  // ("Papa ko dhai sau" as set_amount would lose Papa; "nahi, Rahul ko 300" as set_payee the 300).
  if ((action === "set_amount" || action === "set_payee") && name && amount && latest.includes(normalize(name))) {
    return { ok: true, action: "pay", name, amount };
  }

  if (action === "pay") {
    if (!name && !amount) return UNKNOWN;
    return { ok: true, action, ...(name ? { name } : {}), ...(amount ? { amount } : {}) };
  }
  if (action === "set_amount") return amount ? { ok: true, action, amount } : UNKNOWN;
  // A reminder needs who and when; the date must be in the latest message and readable by code.
  if (action === "create_reminder") {
    const when = whenText?.trim() && latest.includes(normalize(whenText)) ? parseWhen(whenText) : null;
    if (!name || !when) return UNKNOWN;
    return { ok: true, action, name, ...(amount ? { amount } : {}), when };
  }
  return name ? { ok: true, action, name } : UNKNOWN;
}
