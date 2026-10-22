import { MESSAGE_IDS } from "../agent";
import { speechTexts } from "../speech";
import { CANCEL_PHRASES, normalizeUtterance } from "../voiceConfirm";
import { HOME_LISTEN_MS, MAX_NUDGES, afterMiss, greetingQuestion, receiptSpeech } from "../voiceFlow";

const EN = speechTexts("en-IN");
const HI = speechTexts("hi-IN");

const base = { status: "success" as const, amountPaise: 60000, name: "Ramesh", rehearsal: false, launchFailed: false, needsAnswer: false };

describe("Home greeting (M16)", () => {
  it("asks who to pay on a fresh start", () => {
    expect(greetingQuestion({ awaiting: null })).toBe("payee");
    expect(greetingQuestion({ awaiting: "payee" })).toBe("payee");
  });

  it("asks how much when the conversation is waiting for the amount", () => {
    expect(greetingQuestion({ awaiting: "amount" })).toBe("amount");
  });

  it("Home listens longer than the Confirm card's 5 s", () => {
    expect(HOME_LISTEN_MS).toBeGreaterThan(5000);
  });
});

describe("silence / failure on Home (M16)", () => {
  it("one spoken nudge, then quiet", () => {
    expect(MAX_NUDGES).toBe(1);
    expect(afterMiss(1)).toBe("nudge");
    expect(afterMiss(2)).toBe("quiet");
    expect(afterMiss(5)).toBe("quiet");
  });
});

describe("receipt speech (M16)", () => {
  it("success says the amount and the payee", () => {
    expect(receiptSpeech(EN, base)).toBe("Done. 600 rupees sent to Ramesh.");
    expect(receiptSpeech(HI, base)).toBe("हो गया। Ramesh को 600 रुपये भेज दिए।");
  });

  it("failed: PhonePe said no, or never opened", () => {
    expect(receiptSpeech(EN, { ...base, status: "failed" })).toBe(EN.notPaid);
    expect(receiptSpeech(EN, { ...base, status: "failed", launchFailed: true })).toBe(EN.noUpiApp);
  });

  it("an unknown result asks, and never claims it was paid", () => {
    const line = receiptSpeech(EN, { ...base, status: "unknown", needsAnswer: true });
    expect(line).toBe(EN.didItGo);
    expect(line).not.toMatch(/\d/);
  });

  it("says nothing while PhonePe is still open", () => {
    expect(receiptSpeech(EN, { ...base, status: "pending" })).toBeNull();
  });

  it("a rehearsal always says that no money moved", () => {
    expect(receiptSpeech(EN, { ...base, rehearsal: true })).toBe(`Done. 600 rupees sent to Ramesh. ${EN.rehearsalNote}`);
    expect(receiptSpeech(HI, { ...base, rehearsal: true })).toContain(HI.rehearsalNote);
  });

  it("Hindi has every M16 line in Devanagari", () => {
    for (const text of [HI.nudge, HI.failed, HI.notPaid, HI.didItGo, HI.rehearsalNote, HI.paid("600 रुपये", "मम्मी")]) {
      expect(text).toMatch(/[ऀ-ॿ]/);
    }
  });

  // The mic reopens after the nudge and the failure line, so they must not end with an answer word.
  it("no M16 line ends with a yes-word or a cancel word", () => {
    const answerWords = new Set(["yes", "haan", "ok", "हाँ", ...CANCEL_PHRASES.filter((p) => !p.includes(" "))].map((w) => normalizeUtterance(w)));
    for (const t of [EN, HI]) {
      const agentLines = [...MESSAGE_IDS.map((m) => t.tell(m, "Mummy")), t.recent(0), t.recent(1), t.recent(3), t.amountFor("Mummy")]; // M14 + polish
      for (const line of [t.nudge, t.failed, t.paid(t.rupees(60000), "Mummy"), t.notPaid, t.noUpiApp, t.didItGo, t.rehearsalNote, t.dontKnow("Mummy"), t.noUpiFor("Mummy"), ...agentLines]) {
        expect(answerWords.has(normalizeUtterance(line).split(" ").at(-1)!)).toBe(false);
      }
    }
  });

  // Home has no echo filter: a spoken line that is itself a payment command could be heard back.
  it("the nudge contains no amount", () => {
    for (const t of [EN, HI]) expect(t.nudge).not.toMatch(/\d/);
  });
});
