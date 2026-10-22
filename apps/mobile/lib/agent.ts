// The agent on the phone (M14, docs/AGENT.md). Pure: the network call and the payee lookup come in as
// functions, so this is tested without a phone.
// - runAgentTurn: one user turn = up to 4 POST /agent steps. The only tool the phone runs in between
//   is find_payee, and the server learns only { match, count } (never a payee's name or UPI ID).
// - planActions: what the phone does with the server's actions. Every card is still built here and
//   confirmed by the user (rule 8); extra payments wait in a queue, one card (and one yes) each.
import type { ConversationTurn, ServerAction } from "./conversation";
import type { MatchResult } from "./match";
import type { PreferenceChange } from "./preferences";

export const MAX_AGENT_STEPS = 4;
export const AGENT_TURN_TIMEOUT_MS = 20_000;

export const MESSAGE_IDS = [
  "cant_change_limits",
  "cant_skip_confirmation",
  "only_saved_payees",
  "payee_saved",
  "payee_not_saved",
  "not_supported",
] as const;
export type MessageId = (typeof MESSAGE_IDS)[number];

export type AgentAction =
  | ServerAction
  | { action: "show_recent"; name?: string; limit: number }
  | { action: "show_limit_left" }
  | { action: "tell"; message: MessageId }
  // M15
  | { action: "set_preference"; key: PreferenceChange["key"]; value: string }
  | { action: "suggest_alias"; alias: string; name: string }
  | { action: "explain_last" };

// M15 actions the phone carries out itself (none of them pays; the alias still needs the fingerprint).
export type Special =
  | { kind: "preference"; change: PreferenceChange }
  | { kind: "alias"; alias: string; name: string }
  | { kind: "explain" };

export type FindResult = { id: string; nameText: string; match: "one" | "many" | "none"; count: number };
export type AgentRequestBody = { turns: ConversationTurn[]; awaiting?: "amount" | "payee"; steps?: FindResult[][] };
export type AgentReply =
  | { ok: true; actions: AgentAction[] }
  | { ok: true; pending: { id: string; tool: "find_payee"; name: string }[] }
  | { ok: false; blocked?: true };

// DEV panel: what each step did (tool names only), kept in memory.
export type StepRecord = { step: number; did: string };

// What the phone found for a name: the server only gets the match type and a count.
export function findResult(match: MatchResult): { match: FindResult["match"]; count: number } {
  if (match.kind === "one") return { match: "one", count: 1 };
  if (match.kind === "many") return { match: "many", count: match.payees.length };
  return { match: "none", count: 0 };
}

export type AgentTurn =
  | { ok: true; actions: AgentAction[]; found: Found[]; record: StepRecord[] }
  | { ok: false; blocked?: true; record: StepRecord[] };

export async function runAgentTurn(p: {
  turns: ConversationTurn[];
  awaiting: "amount" | "payee" | null;
  send: (body: AgentRequestBody) => Promise<AgentReply>;
  findPayee: (name: string) => MatchResult | Promise<MatchResult>;
  now?: () => number;
  timeoutMs?: number;
}): Promise<AgentTurn> {
  const now = p.now ?? Date.now;
  const deadline = now() + (p.timeoutMs ?? AGENT_TURN_TIMEOUT_MS);
  const steps: FindResult[][] = [];
  const found: Found[] = [];
  const record: StepRecord[] = [];
  for (let step = 1; step <= MAX_AGENT_STEPS; step++) {
    if (now() > deadline) return { ok: false, record };
    const reply = await p.send({ turns: p.turns, ...(p.awaiting ? { awaiting: p.awaiting } : {}), ...(steps.length ? { steps } : {}) });
    if (!reply.ok) return { ok: false, ...(reply.blocked ? { blocked: true as const } : {}), record };
    if ("actions" in reply) {
      record.push({ step, did: reply.actions.map((a) => a.action).join(", ") });
      return { ok: true, actions: reply.actions, found, record };
    }
    record.push({ step, did: reply.pending.map((c) => c.tool).join(", ") });
    const results: FindResult[] = [];
    for (const call of reply.pending) {
      const r = findResult(await p.findPayee(call.name));
      found.push({ name: call.name, match: r.match });
      results.push({ id: call.id, nameText: call.name, ...r });
    }
    steps.push(results);
  }
  return { ok: false, record }; // the server never ends after 4 steps; treat like a failure
}

export type Display = { kind: "recent"; name?: string; limit: number } | { kind: "limitLeft" };

export type Plan = {
  // A fixed message to show and say. payee_saved / payee_not_saved are decided by the PHONE's own
  // find_payee result, never by what the model claimed.
  tell?: { message: MessageId; name?: string };
  // Start the conversation fresh before `primary` ("nahi nahi, Papa ko 300" = cancel + pay).
  reset: boolean;
  // The one action for the conversation (applyAction), or a display.
  primary?: ServerAction;
  display?: Display;
  // Further payments, each a card of its own later, after the first one is done.
  queue: ServerAction[];
  // M15: a preference, a nickname proposal or an explanation (the first one counts).
  special?: Special;
};

export type Found = { name: string; match: FindResult["match"] };

export function planActions(actions: AgentAction[], found: Found[] = []): Plan {
  const plan: Plan = { reset: false, queue: [] };
  const conversational: ServerAction[] = [];
  for (const a of actions) {
    if (a.action === "tell") {
      if (plan.tell) continue;
      if (a.message === "payee_saved" || a.message === "payee_not_saved") {
        const last = found.at(-1);
        // No lookup this turn: the model's claim is not repeated.
        if (!last) continue;
        plan.tell = { message: last.match === "none" ? "payee_not_saved" : "payee_saved", name: last.name };
      } else {
        plan.tell = { message: a.message };
      }
    } else if (a.action === "show_recent") {
      plan.display ??= { kind: "recent", ...(a.name ? { name: a.name } : {}), limit: a.limit };
    } else if (a.action === "show_limit_left") {
      plan.display ??= { kind: "limitLeft" };
    } else if (a.action === "set_preference") {
      plan.special ??= { kind: "preference", change: { key: a.key, value: a.value } };
    } else if (a.action === "suggest_alias") {
      plan.special ??= { kind: "alias", alias: a.alias, name: a.name };
    } else if (a.action === "explain_last") {
      plan.special ??= { kind: "explain" };
    } else {
      conversational.push(a);
    }
  }
  // A cancel followed by something else = start over with that.
  if (conversational.length > 1 && conversational[0]!.action === "cancel") {
    plan.reset = true;
    conversational.shift();
  }
  const [first, ...more] = conversational;
  if (first) plan.primary = first;
  // Only payments may wait in the queue; anything else after the first action is dropped.
  plan.queue = first?.action === "pay" ? more.filter((a) => a.action === "pay") : [];
  // Nothing to do at all (e.g. only a payee_saved claim without a lookup) → not understood.
  if (!plan.tell && !plan.primary && !plan.display && !plan.special) plan.primary = { action: "unknown" };
  return plan;
}
