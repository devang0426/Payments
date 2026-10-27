// M17 family helper: one trusted person FlowPay offers to call when she is stuck. Name + phone stay
// on the phone (SecureStore); calling only opens the dialer.
import { createHelperStore, decideHelpVoice, makeHelper, telUri } from "../helper";
import { speechTexts } from "../speech";
import { CANCEL_PHRASES, LISTEN_WINDOW_MS, STRICT_YES, normalizeUtterance } from "../voiceConfirm";
import { memoryStore } from "./fixtures";

const KEY = "flowpay.helper.v1";
const BETA = { name: "Beta", phone: "+919000000099" };

describe("makeHelper", () => {
  it.each([
    ["+91 90000 00099", "+919000000099"],
    ["09000000099", "+919000000099"],
    ["9000000099", "+919000000099"],
  ])("phone %j → %j", (phone, normalized) => {
    expect(makeHelper({ name: "Beta", phone })).toEqual({ ok: true, helper: { name: "Beta", phone: normalized } });
  });

  it("trims the name", () => {
    expect(makeHelper({ name: "  Beta  ", phone: "9000000099" })).toEqual({ ok: true, helper: BETA });
  });

  it.each([[""], ["   "], ["x".repeat(51)]])("rejects the name %j", (name) => {
    expect(makeHelper({ name, phone: "9000000099" })).toEqual({ ok: false, error: "INVALID_NAME" });
  });

  it.each([["12345"], ["5000000099"], ["abc"], [""]])("rejects the phone %j", (phone) => {
    expect(makeHelper({ name: "Beta", phone })).toEqual({ ok: false, error: "INVALID_PHONE" });
  });
});

describe("helper store", () => {
  it("is empty at first", async () => {
    expect(await createHelperStore(memoryStore()).load()).toBeNull();
  });

  it("saves, loads and clears", async () => {
    const kv = memoryStore();
    const store = createHelperStore(kv);
    await store.save(BETA);
    expect(await store.load()).toEqual(BETA);
    await store.clear();
    expect(await store.load()).toBeNull();
    expect(kv.raw.has(KEY)).toBe(false);
  });

  it.each([["not json"], [JSON.stringify({ name: "Beta", phone: "12345" })], [JSON.stringify({ phone: "+919000000099" })]])(
    "unreadable or invalid data reads as no helper (never a crash): %j",
    async (raw) => {
      expect(await createHelperStore(memoryStore({ [KEY]: raw })).load()).toBeNull();
    },
  );

  it("a failing store reads as no helper", async () => {
    const broken = { ...memoryStore(), getItem: async () => Promise.reject(new Error("boom")) };
    expect(await createHelperStore(broken).load()).toBeNull();
  });
});

describe("telUri", () => {
  it("opens the dialer with the number (nothing is called by itself)", () => {
    expect(telUri(BETA)).toBe("tel:+919000000099");
  });
});

describe("decideHelpVoice: 'Should I call Beta?'", () => {
  const asked = speechTexts("en-IN").helperAsk("Beta");
  const heard = (transcript: string, ms = 2000) => ({ transcript, listenStartedAt: 0, resultAt: ms, lastSpoken: asked });

  it.each([["haan"], ["Haan ji"], ["yes"], ["yes please"], ["हाँ"], ["हां"], ["haan bhejo na"]])("%j → call", (t) => {
    expect(decideHelpVoice(heard(t))).toBe("call");
  });

  it.each([["nahi"], ["no"], ["rehne do"], ["नहीं"], ["mat karo"]])("%j → no", (t) => {
    expect(decideHelpVoice(heard(t))).toBe("no");
  });

  it.each([["haan nahi"], ["kya"], ["Mummy ko 500"], ["call"]])("%j → not clear", (t) => {
    expect(decideHelpVoice(heard(t))).toBe("notClear");
  });

  it("a late answer (after the listening window) is ignored", () => {
    expect(decideHelpVoice(heard("haan", LISTEN_WINDOW_MS + 1))).toBe("ignore");
  });

  it("silence is ignored", () => {
    expect(decideHelpVoice(heard("  "))).toBe("ignore");
  });

  it("our own question, heard back, is ignored", () => {
    expect(decideHelpVoice(heard("should I call Beta"))).toBe("ignore");
  });
});

describe("helper speech", () => {
  it("asks in both languages and never ends with an answer word", () => {
    const answerWords = new Set([...STRICT_YES.filter((p) => !p.includes(" ")), ...CANCEL_PHRASES.filter((p) => !p.includes(" "))].map((w) => normalizeUtterance(w)));
    for (const lang of ["en-IN", "hi-IN"] as const) {
      const t = speechTexts(lang);
      for (const line of [t.helperAsk("Beta"), t.helperCalling("Beta")]) {
        expect(answerWords.has(normalizeUtterance(line).split(" ").at(-1)!)).toBe(false);
      }
    }
    expect(speechTexts("en-IN").helperAsk("Beta")).toBe("Should I call Beta?");
    expect(speechTexts("hi-IN").helperAsk("Beta")).toBe("क्या Beta को कॉल करूँ?");
  });
});
