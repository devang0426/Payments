// The conversation on Home (M12 router design, docs/AGENT.md). Pure: the server's /turn answer is one
// action; this decides what the app asks next or which payment to resolve. Amounts arrive as integer
// paise or "last" (from the server's code, never the AI); payees are resolved later on the phone.
import {
  addUserTurn,
  applyAction,
  askForAmount,
  startConversation,
  turnsForServer,
  type ConversationState,
  type ServerAction,
} from "../conversation";
import { strings } from "../strings";

const paise = (n: number) => ({ kind: "paise" as const, paise: n });
const last = { kind: "last" as const };

// One user turn + the server's action for it.
function say(state: ConversationState, text: string, action: ServerAction) {
  return applyAction(addUserTurn(state, text), action);
}

describe("conversation: asking for what's missing", () => {
  it("starts empty", () => {
    expect(startConversation()).toEqual({ turns: [], draft: {}, awaiting: null });
  });

  it('"Mummy ko bhejo" → asks "How much?" (spoken template), waiting for the amount', () => {
    const { state, step } = say(startConversation(), "Mummy ko bhejo", { action: "pay", name: "Mummy" });
    expect(step).toEqual({ kind: "ask", question: "amount" });
    expect(state.awaiting).toBe("amount");
    expect(state.draft).toEqual({ name: "Mummy" });
    expect(state.turns.at(-1)).toEqual({ role: "assistant", text: strings.conversation.amount });
  });

  it('… → "pichhli baar jitna" → resolve Mummy + last', () => {
    const asked = say(startConversation(), "Mummy ko bhejo", { action: "pay", name: "Mummy" }).state;
    const { state, step } = say(asked, "pichhli baar jitna", { action: "set_amount", amount: last });
    expect(step).toEqual({ kind: "resolve", name: "Mummy", amount: last });
    expect(state.awaiting).toBeNull();
  });

  it('"Mummy ko 500" in one go → resolve straight away', () => {
    expect(say(startConversation(), "Mummy ko 500", { action: "pay", name: "Mummy", amount: paise(50000) }).step).toEqual({
      kind: "resolve",
      name: "Mummy",
      amount: paise(50000),
    });
  });

  it('only an amount → asks "Who?"; then the name → resolve with the kept amount', () => {
    const first = say(startConversation(), "500 bhejo", { action: "pay", amount: paise(50000) });
    expect(first.step).toEqual({ kind: "ask", question: "payee" });
    expect(first.state.awaiting).toBe("payee");
    expect(say(first.state, "Rahul ko", { action: "set_payee", name: "Rahul" }).step).toEqual({
      kind: "resolve",
      name: "Rahul",
      amount: paise(50000),
    });
  });

  it("set_amount with no name yet → keeps the amount and asks who", () => {
    const { state, step } = say(startConversation(), "500", { action: "set_amount", amount: paise(50000) });
    expect(step).toEqual({ kind: "ask", question: "payee" });
    expect(state.draft).toEqual({ amount: paise(50000) });
  });

  it("a name while waiting for the payee → resolve", () => {
    const asked = say(startConversation(), "500 bhejo", { action: "pay", amount: paise(50000) }).state;
    expect(say(asked, "Mummy ko", { action: "pay", name: "Mummy" }).step).toEqual({
      kind: "resolve",
      name: "Mummy",
      amount: paise(50000),
    });
  });
});

describe("conversation: unclear, relative and cancel", () => {
  it("unknown → asks again, keeping the draft and what it was waiting for", () => {
    const asked = say(startConversation(), "Mummy ko bhejo", { action: "pay", name: "Mummy" }).state;
    const { state, step } = say(asked, "hmm", { action: "unknown" });
    expect(step).toEqual({ kind: "ask", question: "unclear" });
    expect(state.draft).toEqual({ name: "Mummy" });
    expect(state.awaiting).toBe("amount");
  });

  it('a relative amount ("100 kam") → asks for the exact amount, keeps the name', () => {
    const { state, step } = say(startConversation(), "Mummy ko pichhli baar se 100 kam", { action: "ask_exact" });
    expect(step).toEqual({ kind: "ask", question: "exactAmount" });
    expect(state.awaiting).toBe("amount");
    const named = say(startConversation(), "Mummy ko bhejo", { action: "pay", name: "Mummy" }).state;
    expect(say(named, "100 kam", { action: "ask_exact" }).state.draft).toEqual({ name: "Mummy" });
  });

  it("cancel → cancelled, everything cleared", () => {
    const asked = say(startConversation(), "Mummy ko bhejo", { action: "pay", name: "Mummy" }).state;
    const { state, step } = say(asked, "rehne do", { action: "cancel" });
    expect(step).toEqual({ kind: "cancelled" });
    expect(state).toEqual(startConversation());
  });
});

describe("conversation: corrections after a card was shown", () => {
  const shown = () => say(startConversation(), "Mummy ko 500", { action: "pay", name: "Mummy", amount: paise(50000) }).state;

  it('"nahi, teen sau kar do" → resolve Mummy ₹300', () => {
    expect(say(shown(), "nahi, teen sau kar do", { action: "set_amount", amount: paise(30000) }).step).toEqual({
      kind: "resolve",
      name: "Mummy",
      amount: paise(30000),
    });
  });

  it('"Papa ko" → resolve Papa, same amount', () => {
    expect(say(shown(), "Papa ko", { action: "set_payee", name: "Papa" }).step).toEqual({
      kind: "resolve",
      name: "Papa",
      amount: paise(50000),
    });
  });

  it("a full new command replaces both", () => {
    expect(say(shown(), "Rahul ko 200", { action: "pay", name: "Rahul", amount: paise(20000) }).step).toEqual({
      kind: "resolve",
      name: "Rahul",
      amount: paise(20000),
    });
  });
});

describe("askForAmount (the phone asks again itself)", () => {
  it('"same as last time" with no earlier payment → forgets the amount, asks "How much?"', () => {
    const resolved = say(startConversation(), "Mummy ko pichhli baar jitna", { action: "pay", name: "Mummy", amount: last }).state;
    const { state, step } = askForAmount(resolved);
    expect(step).toEqual({ kind: "ask", question: "amount" });
    expect(state.draft).toEqual({ name: "Mummy" });
    expect(state.awaiting).toBe("amount");
    expect(state.turns.at(-1)).toEqual({ role: "assistant", text: strings.conversation.amount });
  });
});

describe("what is sent to the server", () => {
  it("empty or blank text is not a turn", () => {
    expect(addUserTurn(startConversation(), "   ")).toEqual(startConversation());
  });

  it("user text is trimmed", () => {
    expect(addUserTurn(startConversation(), "  Mummy ko 500  ").turns).toEqual([{ role: "user", text: "Mummy ko 500" }]);
  });

  it("assistant turns are only the app's own template questions", () => {
    let state = startConversation();
    state = say(state, "Mummy ko bhejo", { action: "pay", name: "Mummy" }).state;
    state = say(state, "hmm", { action: "unknown" }).state;
    state = say(state, "100 kam", { action: "ask_exact" }).state;
    const templates = Object.values(strings.conversation);
    for (const t of state.turns.filter((x) => x.role === "assistant")) expect(templates).toContain(t.text);
  });

  it("at most the last 6 user turns (with the questions between them), from a user turn to a user turn", () => {
    let state = startConversation();
    for (let i = 1; i <= 8; i++) state = say(state, `try ${i}`, { action: "unknown" }).state;
    state = addUserTurn(state, "try 9"); // the app sends right after the user speaks
    const sent = turnsForServer(state);
    const users = sent.filter((t) => t.role === "user").map((t) => t.text);
    expect(users).toEqual(["try 4", "try 5", "try 6", "try 7", "try 8", "try 9"]);
    expect(sent[0]!.role).toBe("user");
    expect(sent.at(-1)).toEqual({ role: "user", text: "try 9" });
    expect(sent).toHaveLength(11); // 6 user turns + the 5 questions between them
  });

  it("only role + text, nothing else (no payees, UPI IDs or history ever)", () => {
    const state = say(startConversation(), "Mummy ko bhejo", { action: "pay", name: "Mummy" }).state;
    for (const t of turnsForServer(state)) expect(Object.keys(t).sort()).toEqual(["role", "text"]);
  });
});

// M13: two display/card actions. Their answers (a total, a reminder card) are shown by the phone and
// are NEVER added to the conversation, so nothing private goes back to the server on the next turn.
describe("conversation: show_spending and create_reminder (M13)", () => {
  it("show_spending → a step for the phone to show; the conversation itself is unchanged", () => {
    const before = addUserTurn(startConversation(), "Papa ko is mahine kitna bheja?");
    const { state, step } = applyAction(before, { action: "show_spending", name: "Papa", period: "this_month" });
    expect(step).toEqual({ kind: "showSpending", name: "Papa", period: "this_month" });
    expect(state).toEqual(before); // no assistant turn with the total
  });

  it("show_spending in the middle of a payment keeps the draft and what the app is waiting for", () => {
    const asked = say(startConversation(), "Mummy ko bhejo", { action: "pay", name: "Mummy" }).state;
    const { state, step } = say(asked, "aaj kitna bheja?", { action: "show_spending", period: "today" });
    expect(step).toEqual({ kind: "showSpending", period: "today" });
    expect(state.draft).toEqual({ name: "Mummy" });
    expect(state.awaiting).toBe("amount");
  });

  it("create_reminder → a reminder step; the conversation starts fresh (the card is on its own)", () => {
    const when = { kind: "dayOfMonth" as const, day: 1 };
    const { state, step } = say(startConversation(), "1 tareekh ko Mummy ko 2000 bhejne ka yaad dilana", {
      action: "create_reminder",
      name: "Mummy",
      amount: paise(200000),
      when,
    });
    expect(step).toEqual({ kind: "reminder", name: "Mummy", amount: paise(200000), when });
    expect(state).toEqual(startConversation());
  });

  it("create_reminder without an amount", () => {
    const when = { kind: "monthly" as const, day: 1 };
    const { step } = say(startConversation(), "har mahine 1 ko Papa ko yaad dilana", { action: "create_reminder", name: "Papa", when });
    expect(step).toEqual({ kind: "reminder", name: "Papa", when });
  });

  it("after a spending answer, the next request carries no amounts or totals from the phone", () => {
    let state = say(startConversation(), "Papa ko is mahine kitna bheja?", { action: "show_spending", name: "Papa", period: "this_month" }).state;
    state = addUserTurn(state, "Mummy ko bhejo");
    const sent = turnsForServer(state);
    expect(sent).toEqual([
      { role: "user", text: "Papa ko is mahine kitna bheja?" },
      { role: "user", text: "Mummy ko bhejo" },
    ]);
  });
});
