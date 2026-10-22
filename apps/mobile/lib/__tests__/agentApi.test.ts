// M14: the phone's POST /agent call. Only the conversation text, the awaited slot and find_payee
// results (match type + count) are sent; the answer is validated with Zod; any failure → ok: false.
import { sendAgent } from "../api";

const API = "http://192.168.1.10:3000";
const turns = [{ role: "user" as const, text: "Mummy ko 500 aur Papa ko 300" }];

function mockFetch(impl: (url: string, init: RequestInit) => Promise<unknown>) {
  globalThis.fetch = jest.fn(impl) as unknown as typeof fetch;
}
const json = (body: unknown, ok = true) => async () => ({ ok, json: async () => body });
const sentBody = () => JSON.parse((globalThis.fetch as jest.Mock).mock.calls[0][1].body);

afterEach(() => {
  jest.restoreAllMocks();
});

describe("sendAgent → server /agent", () => {
  it("sends the turns (role + text only), the slot and the steps", async () => {
    mockFetch(json({ ok: true, actions: [{ action: "unknown" }] }));
    const steps = [[{ id: "c1", nameText: "Mummy", match: "one" as const, count: 1 }]];
    await sendAgent({ turns: [{ ...turns[0]!, extra: "x" } as never], awaiting: "amount", steps }, API);
    expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toBe(`${API}/agent`);
    expect(sentBody()).toEqual({ turns, awaiting: "amount", steps });
  });

  it("several payments come back in order, amounts in paise", async () => {
    const actions = [
      { action: "pay", name: "Mummy", amount: { kind: "paise", paise: 50000 } },
      { action: "pay", name: "Papa", amount: { kind: "paise", paise: 30000 } },
    ];
    mockFetch(json({ ok: true, actions }));
    expect(await sendAgent({ turns }, API)).toEqual({ ok: true, actions });
  });

  it.each([
    [{ action: "show_recent", name: "Mummy", limit: 3 }],
    [{ action: "show_limit_left" }],
    [{ action: "tell", message: "cant_change_limits" }],
    [{ action: "show_spending", period: "today" }],
  ])("accepts %j", async (action) => {
    mockFetch(json({ ok: true, actions: [action] }));
    expect(await sendAgent({ turns }, API)).toEqual({ ok: true, actions: [action] });
  });

  it("find_payee calls come back as pending", async () => {
    const pending = [{ id: "c1", tool: "find_payee", name: "Sharma ji" }];
    mockFetch(json({ ok: true, pending }));
    expect(await sendAgent({ turns }, API)).toEqual({ ok: true, pending });
  });

  it.each([
    ["free text from the model", { ok: true, actions: [{ action: "say", text: "Sent ₹500!" }] }],
    ["a tell that isn't a fixed message", { ok: true, actions: [{ action: "tell", message: "payment_done" }] }],
    ["a float amount", { ok: true, actions: [{ action: "pay", name: "Mummy", amount: { kind: "paise", paise: 500.5 } }] }],
    ["too many actions", { ok: true, actions: Array.from({ length: 5 }, () => ({ action: "unknown" })) }],
    ["no actions", { ok: true, actions: [] }],
    ["an unknown tool pending", { ok: true, pending: [{ id: "c1", tool: "launch_upi", name: "Mummy" }] }],
    ["a server error", { ok: false, error: "AI_FAILED" }],
  ])("%s → ok: false", async (_label, body) => {
    mockFetch(json(body));
    expect(await sendAgent({ turns }, API)).toEqual({ ok: false });
  });

  it("network failure → ok: false (after one retry)", async () => {
    mockFetch(async () => Promise.reject(new Error("offline")));
    expect(await sendAgent({ turns }, API)).toEqual({ ok: false });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("a UPI ID or phone number in ANY user turn → nothing is sent (blocked)", async () => {
    mockFetch(json({ ok: true, actions: [{ action: "unknown" }] }));
    const withId = [{ role: "user" as const, text: "x.fake@upi ko 500" }, { role: "assistant" as const, text: "Who do you want to pay?" }, turns[0]!];
    expect(await sendAgent({ turns: withId }, API)).toEqual({ ok: false, blocked: true });
    expect(await sendAgent({ turns: [{ role: "user", text: "9000000099 pe 500 bhejo" }] }, API)).toEqual({ ok: false, blocked: true });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("no server URL, no turns, or the last turn not the user's → ok: false without a request", async () => {
    mockFetch(json({ ok: true, actions: [{ action: "unknown" }] }));
    expect(await sendAgent({ turns }, undefined)).toEqual({ ok: false });
    expect(await sendAgent({ turns: [] }, API)).toEqual({ ok: false });
    expect(await sendAgent({ turns: [{ role: "assistant", text: "How much?" }] }, API)).toEqual({ ok: false });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
