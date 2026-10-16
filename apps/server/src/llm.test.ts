import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LlmError, SYSTEM_PROMPT, extractPayment, stripCodeFence } from "./llm.js";

function okResponse(content: unknown) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubEnv("OPENROUTER_MODEL", "test/model");
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
