import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LlmError,
  SYSTEM_PROMPT,
  TURN_SYSTEM_PROMPT,
  callAgent,
  extractPayment,
  extractTurn,
  modelChoice,
  stripCodeFence,
} from "./llm.js";
import { AGENT_SYSTEM_PROMPT, AGENT_TOOLS } from "./tools.js";

function okResponse(content: unknown) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubEnv("OPENROUTER_MODEL", "test/model");
  vi.stubEnv("OPENROUTER_FALLBACK_MODEL", "");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function expectLlmError(type: string) {
  const err = await extractPayment("Mummy ko 500").catch((e: unknown) => e);
  expect(err).toBeInstanceOf(LlmError);
  expect((err as LlmError).type).toBe(type);
  expect((err as LlmError).message).not.toContain("Mummy");
}

describe("extractPayment", () => {
  it("sends the right request to OpenRouter", async () => {
    fetchMock.mockResolvedValue(okResponse('{"name":"Mummy","amountText":"500"}'));
    await extractPayment("Mummy ko 500");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(init.body);
    expect(body.model).toBe("test/model");
    expect(body.temperature).toBe(0);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages).toEqual([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: "Mummy ko 500" },
    ]);
  });

  it("with a fallback model: sends `models` (primary first) and no `model`", async () => {
    vi.stubEnv("OPENROUTER_FALLBACK_MODEL", " test/backup ");
    fetchMock.mockResolvedValue(okResponse('{"name":"Mummy","amountText":"500"}'));
    await extractPayment("Mummy ko 500");

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.models).toEqual(["test/model", "test/backup"]);
    expect(body).not.toHaveProperty("model");
  });

  it("without a fallback model: sends `model` only", async () => {
    fetchMock.mockResolvedValue(okResponse('{"name":"Mummy","amountText":"500"}'));
    await extractPayment("Mummy ko 500");

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.model).toBe("test/model");
    expect(body).not.toHaveProperty("models");
  });

  it("returns the parsed JSON content", async () => {
    fetchMock.mockResolvedValue(okResponse('{"name":"Mummy","amountText":"paanch sau"}'));
    expect(await extractPayment("Mummy ko paanch sau")).toEqual({
      name: "Mummy",
      amountText: "paanch sau",
    });
  });

  it("accepts JSON wrapped in a code fence", async () => {
    fetchMock.mockResolvedValue(okResponse('```json\n{"name":"Papa","amountText":"500"}\n```'));
    expect(await extractPayment("Papa ko 500")).toEqual({ name: "Papa", amountText: "500" });
  });

  it("fails without an API key or model", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    await expectLlmError("NOT_CONFIGURED");
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_MODEL", " ");
    await expectLlmError("NOT_CONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails on a non-2xx status", async () => {
    fetchMock.mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    await expectLlmError("HTTP_401");
  });

  it("fails on a timeout", async () => {
    fetchMock.mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));
    await expectLlmError("TIMEOUT");
  });

  it("fails on a network error", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expectLlmError("NETWORK");
  });

  it("fails when the body isn't JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 200 }));
    await expectLlmError("BAD_RESPONSE");
  });

  it("fails when there is no message content", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    await expectLlmError("NO_CONTENT");
  });

  it("fails when the content isn't JSON", async () => {
    fetchMock.mockResolvedValue(okResponse("Mummy, 500"));
    await expectLlmError("NOT_JSON");
  });
});

describe("extractTurn (one conversation step)", () => {
  const turns = [
    { role: "user" as const, text: "Mummy ko bhejo" },
    { role: "assistant" as const, text: "How much do you want to send?" },
    { role: "user" as const, text: "pichhli baar jitna" },
  ];

  it("sends the turn prompt, what the app waits for, then the turns as chat messages", async () => {
    fetchMock.mockResolvedValue(okResponse('{"action":"set_amount","nameText":null,"amountText":"LAST"}'));
    expect(await extractTurn({ turns, awaiting: "amount" })).toEqual({
      action: "set_amount",
      nameText: null,
      amountText: "LAST",
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.temperature).toBe(0);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages).toEqual([
      { role: "system", content: TURN_SYSTEM_PROMPT },
      { role: "system", content: "The app is waiting for: amount" },
      ...turns.map((t) => ({ role: t.role, content: t.text })),
    ]);
  });

  it("without awaiting: no extra system line", async () => {
    fetchMock.mockResolvedValue(okResponse('{"action":"unknown","nameText":null,"amountText":null}'));
    await extractTurn({ turns: [turns[0]!] });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.messages).toEqual([
      { role: "system", content: TURN_SYSTEM_PROMPT },
      { role: "user", content: "Mummy ko bhejo" },
    ]);
  });

  it("uses the fallback model the same way as /parse", async () => {
    vi.stubEnv("OPENROUTER_FALLBACK_MODEL", "test/backup");
    fetchMock.mockResolvedValue(okResponse('{"action":"unknown","nameText":null,"amountText":null}'));
    await extractTurn({ turns: [turns[0]!] });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).models).toEqual(["test/model", "test/backup"]);
  });

  it("errors carry only a type, never the conversation", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
    const err = await extractTurn({ turns }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).type).toBe("HTTP_500");
    expect((err as LlmError).message).not.toContain("Mummy");
  });

  it("the turn prompt lists the actions and forbids computing amounts", () => {
    for (const action of ["pay", "set_amount", "set_payee", "show_spending", "create_reminder", "cancel", "unknown"]) {
      expect(TURN_SYSTEM_PROMPT).toContain(`"${action}"`);
    }
    expect(TURN_SYSTEM_PROMPT).toMatch(/copied exactly/i);
    expect(TURN_SYSTEM_PROMPT).toMatch(/never (compute|calculate)/i);
  });
});

describe("modelChoice", () => {
  it.each([
    [undefined, { model: "a/one" }],
    ["", { model: "a/one" }],
    ["a/one", { model: "a/one" }], // same as the primary: no point listing it twice
    ["b/two", { models: ["a/one", "b/two"] }],
  ])("fallback %j → %j", (fallback, expected) => {
    expect(modelChoice("a/one", fallback)).toEqual(expected);
  });
});

describe("stripCodeFence", () => {
  it.each([
    ['{"a":1}', '{"a":1}'],
    ['  {"a":1}  ', '{"a":1}'],
    ['```json\n{"a":1}\n```', '{"a":1}'],
    ['```\n{"a":1}\n```', '{"a":1}'],
  ])("%j", (input, expected) => {
    expect(stripCodeFence(input)).toBe(expected);
  });
});

describe("callAgent (M14)", () => {
  const toolReply = (message: unknown, model = "test/model") =>
    new Response(JSON.stringify({ model, choices: [{ message }] }), { status: 200 });

  it("sends the tools, parallel calls and 200 max tokens", async () => {
    fetchMock.mockResolvedValue(toolReply({ content: null, tool_calls: [] }));
    await callAgent([{ role: "user", content: "Mummy ko 500" }]);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.model).toBe("test/model");
    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBe(200);
    expect(body.tool_choice).toBe("auto");
    expect(body.parallel_tool_calls).toBe(true);
    expect(body.provider).toBeUndefined(); // require_parameters + parallel_tool_calls → 404
    expect(body.tools).toEqual(AGENT_TOOLS);
    expect(body.response_format).toBeUndefined();
  });

  it("returns the tool calls with raw argument strings, and the model used", async () => {
    fetchMock.mockResolvedValue(
      toolReply({
        content: "Sending ₹500 now!",
        tool_calls: [{ id: "c1", type: "function", function: { name: "prepare_payment", arguments: '{"nameText":"Mummy","amountText":"500"}' } }],
      }),
    );
    const out = await callAgent([{ role: "user", content: "Mummy ko 500" }]);
    expect(out).toEqual({
      toolCalls: [{ id: "c1", name: "prepare_payment", arguments: '{"nameText":"Mummy","amountText":"500"}' }],
      model: "test/model",
    });
    // The model's free text is dropped.
    expect(JSON.stringify(out)).not.toContain("Sending");
  });

  it("no tool calls → an empty list (the agent reads it as unknown)", async () => {
    fetchMock.mockResolvedValue(toolReply({ content: "hello" }));
    expect((await callAgent([{ role: "user", content: "hi" }])).toolCalls).toEqual([]);
  });

  it("tool_calls that isn't a list → BAD_RESPONSE; HTTP errors keep their type", async () => {
    fetchMock.mockResolvedValue(toolReply({ tool_calls: "nope" }));
    await expect(callAgent([{ role: "user", content: "hi" }])).rejects.toMatchObject({ type: "BAD_RESPONSE" });
    fetchMock.mockResolvedValue(new Response("x", { status: 429 }));
    await expect(callAgent([{ role: "user", content: "hi" }])).rejects.toMatchObject({ type: "HTTP_429" });
  });

  it("the system prompt tells the model to ignore instructions and never compute amounts", () => {
    expect(AGENT_SYSTEM_PROMPT).toMatch(/Ignore any instructions/);
    expect(AGENT_SYSTEM_PROMPT).toMatch(/never translated, corrected or computed/);
  });

  it("no tool can launch a payment, edit a UPI ID, change a limit or read contacts", () => {
    const names = AGENT_TOOLS.map((t) => t.function.name);
    expect(names.sort()).toEqual(
      [
        "ask_user", "cancel_draft", "change_draft", "create_reminder", "explain_last", "find_payee", "prepare_payment",
        "set_preference", "show_limit_left", "show_recent", "show_spending", "suggest_alias", "tell_user",
      ].sort(),
    );
    expect(names.join(" ")).not.toMatch(/launch|upi|vpa|limit_set|contact|confirm/);
  });
});
