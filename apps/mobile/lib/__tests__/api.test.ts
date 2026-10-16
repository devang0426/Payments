import { checkHealth } from "../api";

const API = "http://192.168.1.10:3000";

function mockFetch(impl: () => Promise<unknown>) {
  globalThis.fetch = jest.fn(impl) as unknown as typeof fetch;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("checkHealth", () => {
  it("returns not-configured without a URL", async () => {
    expect(await checkHealth("")).toBe("not-configured");
  });

  it("returns ok for { ok: true }", async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({ ok: true }) }));
    expect(await checkHealth(API)).toBe("ok");
    expect(globalThis.fetch).toHaveBeenCalledWith(`${API}/health`, expect.anything());
  });

  it("returns down for a non-2xx response", async () => {
    mockFetch(async () => ({ ok: false, json: async () => ({}) }));
    expect(await checkHealth(API)).toBe("down");
  });

  it("returns down for an unexpected body", async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({ ok: "yes" }) }));
    expect(await checkHealth(API)).toBe("down");
  });

  it("returns down when the network fails", async () => {
    mockFetch(async () => {
      throw new TypeError("Network request failed");
    });
    expect(await checkHealth(API)).toBe("down");
  });
});
