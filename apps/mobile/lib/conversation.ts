// The conversation (M12 router design, docs/AGENT.md). Pure. The server's /turn answer is ONE action;
// this keeps a draft (spoken name + amount) and decides what the app asks next, or which payment to
// resolve. Amounts arrive as integer paise or "last" (from the server's code, never the AI); the name
// is matched to a saved payee later, on the phone (flow.ts). The app's own side of the conversation
// is only its template questions from strings.ts.
import type { Amount } from "./flow";
import type { When } from "./reminders";
import type { Period } from "./spending";
import { strings } from "./strings";

export type ConversationTurn = { role: "user" | "assistant"; text: string };
export type Question = keyof typeof strings.conversation;

export type Draft = { name?: string; amount?: Amount };

export type ConversationState = {
  turns: ConversationTurn[];
  draft: Draft;
  awaiting: "amount" | "payee" | null;
};

// The server's reading of the latest user turn.
export type ServerAction =
  | { action: "pay"; name?: string; amount?: Amount }
  | { action: "set_amount"; amount: Amount }
  | { action: "set_payee"; name: string }
  | { action: "show_spending"; name?: string; period: Period }
  | { action: "create_reminder"; name: string; amount?: Amount; when: When }
  | { action: "cancel" }
  | { action: "unknown" }
  | { action: "ask_exact" };

export type Step =
  | { kind: "ask"; question: Question }
  | { kind: "resolve"; name: string; amount: Amount }
  | { kind: "showSpending"; name?: string; period: Period }
  | { kind: "reminder"; name: string; amount?: Amount; when: When }
  | { kind: "cancelled" };

const MAX_USER_TURNS_SENT = 6;

// M15: a conversation untouched this long is dropped (never stored; this only clears memory).
export const IDLE_DROP_MS = 10 * 60 * 1000;
export const isIdle = (touchedAt: number, now: number) => now - touchedAt > IDLE_DROP_MS;

export const startConversation = (): ConversationState => ({ turns: [], draft: {}, awaiting: null });

export function addUserTurn(state: ConversationState, text: string): ConversationState {
  const trimmed = text.trim();
  if (!trimmed) return state;
  return { ...state, turns: [...state.turns, { role: "user", text: trimmed }] };
}

function ask(state: ConversationState, question: Question, awaiting: ConversationState["awaiting"]) {
  return {
    state: { ...state, awaiting, turns: [...state.turns, { role: "assistant" as const, text: strings.conversation[question] }] },
    step: { kind: "ask", question } as Step,
  };
}

function resolveOrAsk(state: ConversationState, draft: Draft): { state: ConversationState; step: Step } {
  const withDraft = { ...state, draft };
  if (draft.name && draft.amount) {
    return { state: { ...withDraft, awaiting: null }, step: { kind: "resolve", name: draft.name, amount: draft.amount } };
  }
  return draft.name ? ask(withDraft, "amount", "amount") : ask(withDraft, "payee", "payee");
}

// Without undefined keys, so the draft stays a clean { name?, amount? }.
const draftOf = (name?: string, amount?: Amount): Draft => ({ ...(name ? { name } : {}), ...(amount ? { amount } : {}) });

export function applyAction(state: ConversationState, action: ServerAction): { state: ConversationState; step: Step } {
  switch (action.action) {
    case "cancel":
      return { state: startConversation(), step: { kind: "cancelled" } };
    case "unknown":
      return ask(state, "unclear", state.awaiting);
    case "ask_exact":
      return ask(state, "exactAmount", "amount");
    case "pay":
      return resolveOrAsk(state, draftOf(action.name ?? state.draft.name, action.amount ?? state.draft.amount));
    case "set_amount":
      return resolveOrAsk(state, draftOf(state.draft.name, action.amount));
    case "set_payee":
      return resolveOrAsk(state, draftOf(action.name, state.draft.amount));
    // M13. The answer (a total) is shown by the phone and NOT added as an assistant turn, so it never
    // goes back to the server. A payment in progress stays as it was.
    case "show_spending":
      return { state, step: { kind: "showSpending", ...(action.name ? { name: action.name } : {}), period: action.period } };
    // The reminder card stands on its own; the conversation starts fresh.
    case "create_reminder":
      return {
        state: startConversation(),
        step: { kind: "reminder", name: action.name, ...(action.amount ? { amount: action.amount } : {}), when: action.when },
      };
  }
}

// The phone itself needs the amount again (e.g. "same as last time" but no earlier payment to this
// payee): forget the amount and ask "How much?".
export function askForAmount(state: ConversationState): { state: ConversationState; step: Step } {
  return ask({ ...state, draft: draftOf(state.draft.name) }, "amount", "amount");
}

// What /turn gets: the last 6 user turns and the app's questions between them, role + text only.
export function turnsForServer(state: ConversationState): ConversationTurn[] {
  let users = 0;
  let start = state.turns.length;
  for (let i = state.turns.length - 1; i >= 0 && users < MAX_USER_TURNS_SENT; i--) {
    if (state.turns[i]!.role === "user") {
      users++;
      start = i;
    }
  }
  return state.turns.slice(start).map(({ role, text }) => ({ role, text }));
}
