// M14 agent on the phone: the step loop (find_payee runs here; the server learns only a match type)
// and what the phone does with the server's actions (one card per payment, a queue for the rest).
import {
  AGENT_TURN_TIMEOUT_MS,
  MAX_AGENT_STEPS,
  findResult,
  planActions,
  runAgentTurn,
  type AgentAction,
  type AgentReply,
  type AgentRequestBody,
} from "../agent";
import type { ServerAction } from "../conversation";
import { resolvePayment } from "../flow";
import { matchPayees } from "../match";
import { MUMMY, PAPA, PAYEES, entry, ist } from "./fixtures";

const turns = [{ role: "user" as const, text: "Mummy ko 500" }];
const paise = (n: number) => ({ kind: "paise" as const, paise: n });
const pay = (name: string, n: number): ServerAction => ({ action: "pay", name, amount: paise(n) });

function server(...replies: AgentReply[]) {
  const sent: AgentRequestBody[] = [];
  const send = jest.fn(async (body: AgentRequestBody): Promise<AgentReply> => {
    sent.push(JSON.parse(JSON.stringify(body)));
    return replies.shift() ?? { ok: false };
  });
  return { send, sent };
}

describe("runAgentTurn", () => {
  it('"Mummy ko 500": one step, the actions come back', async () => {
    const { send, sent } = server({ ok: true, actions: [pay("Mummy", 50000)] });
    const turn = await runAgentTurn({ turns, awaiting: null, send, findPayee: (n) => matchPayees(n, PAYEES) });
    expect(turn).toEqual({ ok: true, actions: [pay("Mummy", 50000)], found: [], record: [{ step: 1, did: "pay" }] });
    expect(sent).toEqual([{ turns }]);
  });

  it("find_payee runs on the phone; the server gets only { match, count } back", async () => {
    const { send, sent } = server(
      { ok: true, pending: [{ id: "c1", tool: "find_payee", name: "Mummy" }] },
      { ok: true, actions: [{ action: "tell", message: "payee_saved" }] },
    );
    const turn = await runAgentTurn({ turns: [{ role: "user", text: "Mummy saved hai?" }], awaiting: null, send, findPayee: (n) => matchPayees(n, PAYEES) });
    expect(turn.ok && turn.found).toEqual([{ name: "Mummy", match: "one" }]);
    expect(sent[1]!.steps).toEqual([[{ id: "c1", nameText: "Mummy", match: "one", count: 1 }]]);
    // Nothing about the saved payee (display name, aliases, UPI ID, phone) is sent.
    const wire = JSON.stringify(sent);
    for (const secret of [MUMMY.vpa, MUMMY.phone!, ...MUMMY.aliases]) expect(wire).not.toContain(secret);
  });

  it("several matches → many + the count; no match → none", () => {
    expect(findResult(matchPayees("Rahul", PAYEES))).toEqual({ match: "many", count: 2 });
    expect(findResult(matchPayees("Sharma ji", PAYEES))).toEqual({ match: "none", count: 0 });
  });

  it("the awaiting slot is sent; draft never is (the Confirm card uses /turn)", async () => {
    const { send, sent } = server({ ok: true, actions: [{ action: "set_amount", amount: paise(50000) }] });
    await runAgentTurn({ turns, awaiting: "amount", send, findPayee: () => ({ kind: "none" }) });
    expect(sent[0]!.awaiting).toBe("amount");
  });

  it(`at most ${MAX_AGENT_STEPS} steps: a server that keeps asking → failure`, async () => {
    const pending: AgentReply = { ok: true, pending: [{ id: "c", tool: "find_payee", name: "Mummy" }] };
    const { send } = server(pending, { ...pending }, { ...pending }, { ...pending }, { ...pending });
    const turn = await runAgentTurn({ turns, awaiting: null, send, findPayee: () => ({ kind: "none" }) });
    expect(turn.ok).toBe(false);
    expect(send).toHaveBeenCalledTimes(MAX_AGENT_STEPS);
  });

  it("20 s per turn: past the deadline no further step is sent", async () => {
    let t = 0;
    const { send } = server({ ok: true, pending: [{ id: "c", tool: "find_payee", name: "Mummy" }] }, { ok: true, actions: [] });
    const turn = await runAgentTurn({
      turns,
      awaiting: null,
      send,
      findPayee: () => {
        t += AGENT_TURN_TIMEOUT_MS + 1;
        return { kind: "none" };
      },
      now: () => t,
    });
    expect(turn.ok).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("a failure or a blocked text passes through (nothing proceeds)", async () => {
    expect((await runAgentTurn({ turns, awaiting: null, send: server({ ok: false }).send, findPayee: () => ({ kind: "none" }) })).ok).toBe(false);
    const blocked = await runAgentTurn({ turns, awaiting: null, send: server({ ok: false, blocked: true }).send, findPayee: () => ({ kind: "none" }) });
    expect(blocked).toEqual({ ok: false, blocked: true, record: [] });
  });
});

describe("planActions", () => {
  it("one payment → the primary action, no queue", () => {
    expect(planActions([pay("Mummy", 50000)])).toEqual({ reset: false, primary: pay("Mummy", 50000), queue: [] });
  });

  it("several payments → the first now, the rest queued in order (one card + one yes each)", () => {
    const plan = planActions([pay("Mummy", 50000), pay("Papa", 30000), pay("Rahul", 20000)]);
    expect(plan.primary).toEqual(pay("Mummy", 50000));
    expect(plan.queue).toEqual([pay("Papa", 30000), pay("Rahul", 20000)]);
  });

  it("cancel + pay → start fresh with the payment", () => {
    expect(planActions([{ action: "cancel" }, pay("Papa", 30000)])).toEqual({ reset: true, primary: pay("Papa", 30000), queue: [] });
  });

  it("cancel alone stays a cancel", () => {
    expect(planActions([{ action: "cancel" }])).toEqual({ reset: false, primary: { action: "cancel" }, queue: [] });
  });

  it("tell + pay → both: the message, then the card (limits still apply on the card)", () => {
    expect(planActions([{ action: "tell", message: "cant_skip_confirmation" }, pay("Papa", 20000)])).toEqual({
      reset: false,
      tell: { message: "cant_skip_confirmation" },
      primary: pay("Papa", 20000),
      queue: [],
    });
  });

  it("payee_saved / payee_not_saved follow the PHONE's lookup, not the model's claim", () => {
    const lie: AgentAction[] = [{ action: "tell", message: "payee_saved" }];
    expect(planActions(lie, [{ name: "Sharma ji", match: "none" }]).tell).toEqual({ message: "payee_not_saved", name: "Sharma ji" });
    expect(planActions([{ action: "tell", message: "payee_not_saved" }], [{ name: "Mummy", match: "one" }]).tell).toEqual({
      message: "payee_saved",
      name: "Mummy",
    });
    // No lookup this turn: the claim is dropped → not understood.
    expect(planActions(lie)).toEqual({ reset: false, primary: { action: "unknown" }, queue: [] });
  });

  it("display actions: only the first is shown", () => {
    expect(planActions([{ action: "show_limit_left" }, { action: "show_recent", limit: 5 }]).display).toEqual({ kind: "limitLeft" });
    expect(planActions([{ action: "show_recent", name: "Mummy", limit: 3 }]).display).toEqual({ kind: "recent", name: "Mummy", limit: 3 });
  });

  it("only payments may be queued: anything else after the first action is dropped", () => {
    const plan = planActions([pay("Mummy", 50000), { action: "set_amount", amount: paise(100) }, { action: "cancel" }]);
    expect(plan.queue).toEqual([]);
  });

  it("an empty answer → not understood", () => {
    expect(planActions([])).toEqual({ reset: false, primary: { action: "unknown" }, queue: [] });
  });
});

// Docs/AGENT.md "Property test": whatever the model answered, a card's payee is a saved payee and its
// paise are the server's parsed paise (or the phone's own last payment for "same as last time").
describe("property: any actions → cards only for saved payees, with paise from code", () => {
  const names = ["Mummy", "Papa", "Rahul", "Attacker", "x.fake@upi", "मम्मी", ""];
  const amounts = [{ kind: "paise" as const, paise: 50000 }, { kind: "paise" as const, paise: 1 }, { kind: "last" as const }];
  const history = [entry({ payeeId: PAPA.id, amountPaise: 25000, createdAt: ist("2026-10-10T10:00:00") })];
  let seed = 42;
  const rand = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed % n;
  };

  it("500 random answers", () => {
    for (let i = 0; i < 500; i++) {
      const actions: AgentAction[] = Array.from({ length: 1 + rand(4) }, () => ({ action: "pay", name: names[rand(names.length)]!, amount: amounts[rand(amounts.length)]! }));
      const plan = planActions(actions);
      for (const a of [plan.primary, ...plan.queue]) {
        if (a?.action !== "pay" || !a.name || !a.amount) continue;
        const result = resolvePayment({ name: a.name, amount: a.amount, payees: PAYEES, history, historyUnreadable: false, now: ist("2026-10-19T12:00:00") });
        if (result.kind !== "confirm") continue;
        expect(PAYEES).toContainEqual(result.payee);
        const expected = a.amount.kind === "paise" ? a.amount.paise : history.find((h) => h.payeeId === result.payee.id)?.amountPaise;
        expect(result.amountPaise).toBe(expected);
      }
    }
  });
});
