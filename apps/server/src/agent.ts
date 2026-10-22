// /agent logic (M14, docs/AGENT.md): one step of the stateless tool-calling agent. The phone keeps
// the conversation and sends it with the results of the tools it ran this turn; the server makes ONE
// LLM call and checks every tool call with the same code as /turn (checkAiTurn: spans in the user's
// own words, amounts by parseAmount, relative amounts → ask). Card params still come from the phone:
// it matches the payee, runs the rules, makes the txnRef and asks for the yes.
// - Any invalid call (unknown tool, bad JSON, wrong types, an invented span, too many calls) makes the
//   whole step "unknown": nothing half-understood reaches the phone.
// - The model's free text is never used; the phone only says its own templates (tell_user ids).
// - find_payee is the only tool the phone runs before the model answers; the model sees only
//   { match, count }. Every other tool ends the turn without another LLM call.
import { z } from "zod";
import type { AgentCaller, AgentMessage, ConversationTurn, RawToolCall } from "./llm.js";
import { MAX_TEXT_LENGTH, normalize } from "./parse.js";
import { AGENT_SYSTEM_PROMPT, MESSAGE_IDS, PREFERENCE_KEYS, PREFERENCE_VALUES } from "./tools.js";
import { AiTurn, MAX_TURNS, MAX_USER_TURNS, checkAiTurn, type CheckedTurn } from "./turn.js";
import { findPeriodIn } from "./when.js";

export const MAX_STEPS = 4; // LLM calls per user turn
export const MAX_TOOL_CALLS = 6; // per user turn, all steps together
export const MAX_PAYMENTS_PER_TURN = 3;
const MAX_ACTIONS = 4;
const DEFAULT_RECENT = 5;

const Turn = z.strictObject({
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
});
const CallId = z.string().regex(/^[\w.:-]{1,64}$/);
// What the phone sends back for a find_payee it ran: the call (id + the name span) and a match type.
const FindResult = z.strictObject({
  id: CallId,
  nameText: z.string().trim().min(1).max(100),
  match: z.enum(["one", "many", "none"]),
  count: z.number().int().min(0).max(50),
});
type FindResult = z.infer<typeof FindResult>;

const userTextsOf = (turns: { role: string; text: string }[]) => turns.filter((t) => t.role === "user").map((t) => normalize(t.text));

export const AgentRequest = z
  .strictObject({
    turns: z.array(Turn).min(1).max(MAX_TURNS),
    awaiting: z.enum(["amount", "payee"]).optional(),
    steps: z.array(z.array(FindResult).min(1).max(MAX_TOOL_CALLS)).max(MAX_STEPS - 1).optional(),
  })
  .refine((r) => r.turns.at(-1)?.role === "user", "the last turn must be the user's")
  .refine((r) => r.turns.filter((t) => t.role === "user").length <= MAX_USER_TURNS, "too many user turns")
  .refine((r) => (r.steps ?? []).flat().length <= MAX_TOOL_CALLS, "too many tool calls")
  .refine((r) => {
    const ids = (r.steps ?? []).flat().map((s) => s.id);
    return new Set(ids).size === ids.length;
  }, "duplicate tool call ids")
  // A tool result can only be about a name the user really said.
  .refine((r) => {
    const users = userTextsOf(r.turns);
    return (r.steps ?? []).flat().every((s) => users.some((u) => u.includes(normalize(s.nameText))));
  }, "tool result for a name the user never said");
export type AgentRequest = z.infer<typeof AgentRequest>;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type MessageId = (typeof MESSAGE_IDS)[number];
export type AgentAction =
  | DistributiveOmit<CheckedTurn, "ok">
  | { action: "show_recent"; name?: string; limit: number }
  | { action: "show_limit_left" }
  | { action: "tell"; message: MessageId }
  // M15
  | { action: "set_preference"; key: (typeof PREFERENCE_KEYS)[number]; value: string }
  | { action: "suggest_alias"; alias: string; name: string }
  | { action: "explain_last" };
export type PendingCall = { id: string; tool: "find_payee"; name: string };

export type AgentResponse =
  | { ok: true; actions: AgentAction[] }
  | { ok: true; pending: PendingCall[] }
  | { ok: false; error: "AI_FAILED" | "BAD_INPUT" };

// For the server log: step number, tool names (only known ones), the model used. Never arguments.
export type AgentStepInfo = { step: number; tools: string[]; model?: string; error?: string };

const Span = z.string().max(MAX_TEXT_LENGTH).nullable().optional();
const ARGS = {
  prepare_payment: z.object({ nameText: Span, amountText: Span }),
  change_draft: z.object({ nameText: Span, amountText: Span }),
  cancel_draft: z.object({}),
  ask_user: z.object({ reason: z.enum(["exact_amount", "unclear"]) }),
  tell_user: z.object({ messageId: z.enum(MESSAGE_IDS) }),
  find_payee: z.object({ nameText: z.string().trim().min(1).max(100) }),
  show_spending: z.object({ nameText: Span, periodText: Span }),
  show_recent: z.object({ nameText: Span, limit: z.number().int().min(1).max(10).optional() }),
  show_limit_left: z.object({}),
  create_reminder: z.object({ nameText: Span, amountText: Span, whenText: Span }),
  // M15
  set_preference: z
    .object({ key: z.enum(PREFERENCE_KEYS), value: z.string() })
    .refine((a) => PREFERENCE_VALUES[a.key].includes(a.value), "value doesn't fit the key"),
  suggest_alias: z.object({ aliasText: z.string().trim().min(1).max(50), nameText: z.string().trim().min(1).max(50) }),
  explain_last: z.object({}),
} as const;
type ToolName = keyof typeof ARGS;
type ParsedCall = { [K in ToolName]: { id: string; name: K; args: z.infer<(typeof ARGS)[K]> } }[ToolName];

const isTool = (name: string): name is ToolName => Object.hasOwn(ARGS, name);
const UNKNOWN: AgentResponse = { ok: true, actions: [{ action: "unknown" }] };

function parseCall(raw: RawToolCall): ParsedCall | null {
  if (!isTool(raw.name)) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw.arguments || "{}");
  } catch {
    return null;
  }
  const args = ARGS[raw.name].safeParse(json ?? {});
  return args.success ? ({ id: raw.id, name: raw.name, args: args.data } as ParsedCall) : null;
}

const strip = (r: CheckedTurn): AgentAction => {
  const { ok: _ok, ...action } = r;
  return action as AgentAction;
};
const aiTurn = (action: z.infer<typeof AiTurn>["action"], a: { nameText?: string | null; amountText?: string | null; periodText?: string | null; whenText?: string | null }) =>
  ({ action, nameText: a.nameText ?? null, amountText: a.amountText ?? null, periodText: a.periodText ?? null, whenText: a.whenText ?? null });

// Several payments in one message: the part of the latest message that belongs to each one, from its
// name to the next name, without a joining "aur" / "और" / "and". null when a name isn't in the latest
// message (then it can't be split safely).
const JOINER = /(^|\s)(aur|और|and|&)\s*$/u;
function paymentScopes(latest: string, names: string[]): { scopes: string[]; order: number[] } | null {
  const found = names.map((name, i) => ({ i, at: latest.indexOf(normalize(name)) }));
  if (found.some((f) => f.at < 0)) return null;
  const sorted = [...found].sort((a, b) => a.at - b.at);
  if (sorted.some((f, k) => k > 0 && f.at === sorted[k - 1]!.at)) return null;
  const scopes: string[] = new Array(names.length);
  sorted.forEach((f, k) => {
    const end = k + 1 < sorted.length ? sorted[k + 1]!.at : latest.length;
    scopes[f.i] = latest.slice(f.at, end).trim().replace(JOINER, "").trim();
  });
  return { scopes, order: sorted.map((f) => f.i) };
}

const wordsOf = (text: string) => text.replace(/[.,!?।"'“”…]/g, " ").split(/\s+/);
const HOW_MUCH = new Set(["kitna", "kitne", "kitni", "कितना", "कितने", "कितनी", "much"].map((w) => w.normalize("NFC")));
const SHOW = new Set(["dikhao", "dikha", "dikhana", "dikhaiye", "show", "list", "दिखाओ", "दिखा", "दिखाइए"].map((w) => w.normalize("NFC")));
// The words a preference change must contain (latest message, already lowercase + NFC).
const SPEAKING = /bol|speak|awaa?z|voice|chup|sound|बोल|आवाज़|आवाज|चुप/u;
const PREFERENCE_WORDS: Record<string, RegExp> = {
  hindi: /hindi|हिंदी|हिन्दी/u,
  english: /english|angre[zj]i|अंग्रेज़ी|अंग्रेजी|इंग्लिश/u,
  auto: /auto|mic|माइक/u,
  on: SPEAKING,
  off: SPEAKING,
};
const asksHowMuch = (latest: string) => wordsOf(latest).some((w) => HOW_MUCH.has(w));
const asksToShow = (latest: string) => wordsOf(latest).some((w) => SHOW.has(w));

function toAction(call: Exclude<ParsedCall, { name: "find_payee" | "prepare_payment" }>, turns: ConversationTurn[]): AgentAction {
  switch (call.name) {
    case "change_draft": {
      const { nameText, amountText } = call.args;
      const action = nameText?.trim() && amountText?.trim() ? "pay" : amountText?.trim() ? "set_amount" : nameText?.trim() ? "set_payee" : "unknown";
      return strip(checkAiTurn(aiTurn(action, call.args), turns));
    }
    case "cancel_draft":
      return { action: "cancel" };
    case "ask_user":
      return call.args.reason === "exact_amount" ? { action: "ask_exact" } : { action: "unknown" };
    case "tell_user":
      return { action: "tell", message: call.args.messageId };
    case "show_spending": {
      // Seen live: the model copies a period from the prompt's examples ("is mahine" when she said
      // "pichhle mahine"). If her words hold a period code can read, that one counts (display only).
      // /turn keeps its stricter M13 rule.
      const latest = userTextsOf(turns).at(-1)!;
      const copied = call.args.periodText?.trim() && !latest.includes(normalize(call.args.periodText)) && findPeriodIn(latest);
      return strip(checkAiTurn(aiTurn("show_spending", { ...call.args, ...(copied ? { periodText: null } : {}), amountText: null }), turns));
    }
    case "show_recent": {
      const name = call.args.nameText?.trim();
      if (name && !userTextsOf(turns).some((u) => u.includes(normalize(name)))) return { action: "unknown" };
      // "Papa ko kitna bheja?" asks HOW MUCH (a total), not to SEE payments; the model sometimes picks
      // the list (seen live). Both are display-only; the period is read from her words by code.
      const latest = userTextsOf(turns).at(-1)!;
      if (asksHowMuch(latest) && !asksToShow(latest)) {
        return { action: "show_spending", ...(name ? { name } : {}), period: findPeriodIn(latest) ?? "all" };
      }
      return { action: "show_recent", ...(name ? { name } : {}), limit: call.args.limit ?? DEFAULT_RECENT };
    }
    case "show_limit_left":
      return { action: "show_limit_left" };
    case "create_reminder":
      return strip(checkAiTurn(aiTurn("create_reminder", call.args), turns));
    case "set_preference": {
      // Only when her words name it (seen live: "meri daily limit 50000 kar do" came back as a language).
      const latest = userTextsOf(turns).at(-1)!;
      if (!PREFERENCE_WORDS[call.args.value]?.test(latest)) return { action: "unknown" };
      return { action: "set_preference", key: call.args.key, value: call.args.value };
    }
    case "suggest_alias": {
      // Both names from her latest message, and two different names. Saving needs the fingerprint/PIN
      // on the phone; this only proposes it.
      const latest = userTextsOf(turns).at(-1)!;
      const [alias, name] = [call.args.aliasText, call.args.nameText];
      if (!latest.includes(normalize(alias)) || !latest.includes(normalize(name)) || normalize(alias) === normalize(name)) {
        return { action: "unknown" };
      }
      return { action: "suggest_alias", alias, name };
    }
    case "explain_last":
      return { action: "explain_last" };
  }
}

function buildMessages(req: AgentRequest): AgentMessage[] {
  const messages: AgentMessage[] = [{ role: "system", content: AGENT_SYSTEM_PROMPT }];
  if (req.awaiting) messages.push({ role: "system", content: `The app is waiting for: ${req.awaiting}` });
  for (const t of req.turns) messages.push({ role: t.role, content: t.text });
  for (const step of req.steps ?? []) {
    messages.push({
      role: "assistant",
      content: null,
      tool_calls: step.map((s: FindResult) => ({
        id: s.id,
        type: "function" as const,
        function: { name: "find_payee", arguments: JSON.stringify({ nameText: s.nameText }) },
      })),
    });
    for (const s of step) messages.push({ role: "tool", tool_call_id: s.id, content: JSON.stringify({ match: s.match, count: s.count }) });
  }
  return messages;
}

export async function runAgent(req: AgentRequest, call: AgentCaller, onStep?: (info: AgentStepInfo) => void): Promise<AgentResponse> {
  const turns: ConversationTurn[] = req.turns;
  const priorSteps = req.steps ?? [];
  const priorCalls = priorSteps.flat().length;

  let reply: Awaited<ReturnType<AgentCaller>>;
  try {
    reply = await call(buildMessages(req));
  } catch (e) {
    // Only the error's type (LlmError) is reported, never its content.
    const type = e instanceof Error && "type" in e && typeof e.type === "string" ? e.type : "UNKNOWN";
    onStep?.({ step: priorSteps.length + 1, tools: [], error: type });
    return { ok: false, error: "AI_FAILED" };
  }
  onStep?.({ step: priorSteps.length + 1, tools: reply.toolCalls.map((c) => (isTool(c.name) ? c.name : "?")), ...(reply.model ? { model: reply.model } : {}) });

  if (reply.toolCalls.length === 0 || priorCalls + reply.toolCalls.length > MAX_TOOL_CALLS) return UNKNOWN;
  const calls = reply.toolCalls.map(parseCall);
  if (calls.some((c) => c === null)) return UNKNOWN;
  const parsed = calls as ParsedCall[];
  const users = userTextsOf(turns);
  const latest = users.at(-1)!;

  // Only find_payee: the phone runs it and asks again (while steps are left).
  const terminal = parsed.filter((c) => c.name !== "find_payee");
  if (terminal.length === 0) {
    if (priorSteps.length + 1 >= MAX_STEPS) return UNKNOWN;
    const pending: PendingCall[] = [];
    for (const c of parsed) {
      if (c.name !== "find_payee") continue;
      if (!CallId.safeParse(c.id).success || !users.some((u) => u.includes(normalize(c.args.nameText)))) return UNKNOWN;
      pending.push({ id: c.id, tool: "find_payee", name: c.args.nameText });
    }
    return { ok: true, pending };
  }

  // Payments: one per person; with several, each is read only from its own part of the message.
  let payments = terminal.filter((c): c is Extract<ParsedCall, { name: "prepare_payment" }> => c.name === "prepare_payment");
  if (payments.length > MAX_PAYMENTS_PER_TURN) return UNKNOWN;
  // change_draft next to prepare_payment describes the SAME payment (seen live): merge them into one,
  // the change's spans winning, so one payment never becomes two cards. Anything stranger → unknown.
  const changes = terminal.filter((c): c is Extract<ParsedCall, { name: "change_draft" }> => c.name === "change_draft");
  let rest = terminal;
  if (changes.length > 1 || (changes.length === 1 && payments.length > 1)) return UNKNOWN;
  if (changes.length === 1 && payments.length === 1) {
    const [change, prep] = [changes[0]!, payments[0]!];
    const pick = (a?: string | null, b?: string | null) => (a?.trim() ? a : b);
    payments = [{ ...prep, args: { nameText: pick(change.args.nameText, prep.args.nameText), amountText: pick(change.args.amountText, prep.args.amountText) } }];
    rest = terminal.filter((c) => c !== change);
  }
  let paymentActions: AgentAction[];
  if (payments.length <= 1) {
    paymentActions = payments.map((p) => strip(checkAiTurn(aiTurn("pay", p.args), turns)));
  } else {
    const split = paymentScopes(
      latest,
      payments.map((p) => p.args.nameText?.trim() ?? ""),
    );
    if (!split || payments.some((p) => !p.args.nameText?.trim())) return UNKNOWN;
    const checked = split.order.map((i) => strip(checkAiTurn(aiTurn("pay", payments[i]!.args), turns, split.scopes[i])));
    if (checked.some((a) => a.action === "unknown")) return UNKNOWN;
    if (checked.some((a) => a.action === "ask_exact")) return { ok: true, actions: [{ action: "ask_exact" }] };
    paymentActions = checked;
  }

  const others = rest.filter((c) => c.name !== "prepare_payment") as Exclude<ParsedCall, { name: "find_payee" | "prepare_payment" }>[];
  // One question gets one display: when the model calls several display tools, the first one counts
  // (they only show the phone's own numbers, so dropping the rest loses nothing).
  const DISPLAY = new Set(["show_spending", "show_recent", "show_limit_left"]);
  const firstDisplay = others.find((c) => DISPLAY.has(c.name));
  const kept = others.filter((c) => !DISPLAY.has(c.name) || c === firstDisplay);
  // A display whose spans fail the check (seen live: the model repeats an earlier spending question
  // next to a new payment) is dropped when something valid remains; it would only have shown the
  // phone's own numbers. A failed payment or change is never dropped: it makes the step unknown.
  const checked = kept.map((c) => ({ display: DISPLAY.has(c.name), action: toAction(c, turns) }));
  // The same non-payment action twice (seen live) counts once. Payments never get here twice: the
  // same person twice is already unknown.
  const valid = checked
    .filter((x) => !(x.display && x.action.action === "unknown"))
    .map((x) => x.action)
    .filter((a, i, all) => all.findIndex((b) => JSON.stringify(b) === JSON.stringify(a)) === i);
  // A payment card is the answer: a display next to it is dropped (seen live: "limit left" + the card).
  const PAYING = new Set(["pay", "set_amount", "set_payee"]);
  const pays = paymentActions.length > 0 || valid.some((a) => PAYING.has(a.action));
  const shown = pays ? valid.filter((a) => !["show_spending", "show_recent", "show_limit_left"].includes(a.action)) : valid;
  const actions = shown.length + paymentActions.length > 0 ? [...shown, ...paymentActions] : [{ action: "unknown" } as AgentAction];
  if (actions.length > MAX_ACTIONS || actions.some((a) => a.action === "unknown")) return UNKNOWN;
  return { ok: true, actions };
}
