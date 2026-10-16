import { parseText } from "../api";

const API = "http://192.168.1.10:3000";

function mockFetch(impl: (url: string, init: RequestInit) => Promise<unknown>) {
  globalThis.fetch = jest.fn(impl) as unknown as typeof fetch;
}

const json = (body: unknown, ok = true) => async () => ({ ok, json: async () => body });

afterEach(() => {
  jest.restoreAllMocks();
});

describe("parseText → server /parse", () => {
  it("sends only the text, as JSON, to /parse", async () => {
    mockFetch(json({ ok: true, name: "Mummy", amount: { kind: "paise", paise: 50000 } }));
    await parseText("Mummy ko paanch sau bhejo", API);
    const [url, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`${API}/parse`);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ text: "Mummy ko paanch sau bhejo" });
    expect(init.signal).toBeDefined();
  });

  it("ok → name + amountPaise", async () => {
    mockFetch(json({ ok: true, name: "Mummy", amount: { kind: "paise", paise: 50000 } }));
    expect(await parseText("Mummy ko 500", API)).toEqual({ ok: true, name: "Mummy", amount: { kind: "paise", paise: 50000 } });
  });

  it.each([
    [{ ok: false, error: "NO_AMOUNT" }, "NO_AMOUNT"],
    [{ ok: false, error: "NO_NAME" }, "NO_NAME"],
    [{ ok: false, error: "AI_FAILED" }, "FAILED"],
    [{ ok: false, error: "BAD_INPUT" }, "FAILED"],
  ])("%j → %s", async (body, error) => {
    mockFetch(json(body, body.ok !== false));
    expect(await parseText("x", API)).toEqual({ ok: false, error });
  });

  it.each([
    ["fractional paise", { ok: true, name: "Mummy", amount: { kind: "paise", paise: 500.5 } }],
    ["zero paise", { ok: true, name: "Mummy", amount: { kind: "paise", paise: 0 } }],
    ["negative paise", { ok: true, name: "Mummy", amount: { kind: "paise", paise: -100 } }],
    ["paise as a string", { ok: true, name: "Mummy", amount: { kind: "paise", paise: "50000" } }],
    ["empty name", { ok: true, name: "", amount: { kind: "paise", paise: 100 } }],
    ["unknown error code", { ok: false, error: "SOMETHING_NEW" }],
    ["not an object", "hello"],
  ])("unexpected response (%s) → FAILED", async (_label, body) => {
    mockFetch(json(body));
    expect(await parseText("x", API)).toEqual({ ok: false, error: "FAILED" });
  });

  it("\"same as last time\" → kind last (the phone finds the amount)", async () => {
    mockFetch(json({ ok: true, name: "Mummy", amount: { kind: "last" } }));
    expect(await parseText("Mummy ko pichhli baar jitna", API)).toEqual({ ok: true, name: "Mummy", amount: { kind: "last" } });
  });

  it("HTTP error with a valid error body still maps the code (502 AI_FAILED)", async () => {
    mockFetch(json({ ok: false, error: "AI_FAILED" }, false));
    expect(await parseText("x", API)).toEqual({ ok: false, error: "FAILED" });
  });

  it("network failure → FAILED", async () => {
    mockFetch(async () => {
      throw new TypeError("Network request failed");
    });
    expect(await parseText("x", API)).toEqual({ ok: false, error: "FAILED" });
  });

  it("body that isn't JSON → FAILED", async () => {
    mockFetch(async () => ({ ok: true, json: async () => Promise.reject(new SyntaxError("bad")) }));
    expect(await parseText("x", API)).toEqual({ ok: false, error: "FAILED" });
  });

  it("times out after 12 seconds → FAILED", async () => {
    jest.useFakeTimers();
    mockFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const pending = parseText("x", API);
    jest.advanceTimersByTime(12_000);
    expect(await pending).toEqual({ ok: false, error: "FAILED" });
    jest.useRealTimers();
  });

  it("no server URL configured → FAILED without a request", async () => {
    mockFetch(json({}));
    expect(await parseText("x", "")).toEqual({ ok: false, error: "FAILED" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("empty text → FAILED without a request", async () => {
    mockFetch(json({}));
    expect(await parseText("   ", API)).toEqual({ ok: false, error: "FAILED" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
