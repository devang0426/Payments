// Voice confirmation on the Confirm card (CLAUDE.md rule 8, spec + case numbers in docs/AGENT.md
// "Voice confirmation"). decideVoice is pure: when it needs the server's reading of a change it returns
// { kind: "askServer" }; the screen calls /turn, resolves the payee on the phone, and calls it again
// with the outcome. These tests mock that outcome.
import {
  CANCEL_PHRASES,
  LISTEN_WINDOW_MS,
  MAX_REASKS,
  PAUSE_PHRASES,
  STRICT_YES,
  decideSaveVoice,
  decideVoice,
  normalizeUtterance,
  type TurnOutcome,
  type VoiceCard,
  type VoiceDecision,
} from "../voiceConfirm";

const T = 1_000_000; // when the mic opened
const MUMMY = "p-mummy";
const PAPA = "p-papa";
const ASK_300 = "Send 300 rupees to Mummy?";
const REASK_300 = "It's already 300 rupees. Say yes to send.";
const PAUSED = "Okay, tap the mic when you're ready.";

const card = (over: Partial<VoiceCard> = {}): VoiceCard => ({
  txnRef: "FP1",
  payeeId: MUMMY,
  paise: 30000, // ₹300
  tone: "green",
  reasks: 0,
  ...over,
});

const same300: TurnOutcome = { kind: "change", payeeId: MUMMY, paise: 30000 };

type Opts = {
  card?: VoiceCard;
  turn?: TurnOutcome; // what /turn + the phone's payee resolution would say
  atMs?: number; // when the result was finalized, ms after the mic opened
  lastSpoken?: string;
  currentTxnRef?: string; // the card on screen now
  used?: boolean; // the lock for this card's txnRef is already taken
};

// Runs the decision like the screen does: once locally, and again with the /turn outcome if asked.
function hear(transcript: string, o: Opts = {}): { askedServer: boolean; decision: VoiceDecision } {
  const c = o.card ?? card();
  const input = {
    card: c,
    currentTxnRef: o.currentTxnRef ?? c.txnRef,
    used: o.used ?? false,
    heard: { transcript, forTxnRef: c.txnRef, listenStartedAt: T, resultAt: T + (o.atMs ?? 1500), lastSpoken: o.lastSpoken ?? ASK_300 },
  };
  const first = decideVoice(input);
  if (first.kind !== "askServer") return { askedServer: false, decision: first };
  if (!o.turn) throw new Error(`"${transcript}" needs the server, but the test gave no turn outcome`);
  return { askedServer: true, decision: decideVoice(input, o.turn) };
}

const confirm = { kind: "confirm" };
const notClear = { kind: "notClear" };
const cancel = { kind: "cancel" };

describe("constants and lists (pinned to docs/AGENT.md)", () => {
  it("5 s window, 2 re-asks", () => {
    expect(LISTEN_WINDOW_MS).toBe(5000);
    expect(MAX_REASKS).toBe(2);
  });

  it("the strict-yes list", () => {
    expect([...STRICT_YES].sort()).toEqual(
      [
        "yes", "yes please", "yes send", "yes send it", "haan", "haan ji", "haanji", "haan bhejo", "haan bhej do",
        "ok bhejo", "हाँ", "हाँ जी", "हाँ भेजो", "हाँ भेज दो",
      ].sort(),
    );
  });

  it("the cancel list", () => {
    expect([...CANCEL_PHRASES].sort()).toEqual(
      [
        "nahi", "nahin", "no", "na", "cancel", "nahi bhejo", "nahin bhejo", "mat bhejo", "cancel karo", "rehne do",
        "rahne do", "chhodo", "chodo", "नहीं", "ना", "नहीं भेजो", "मत भेजो", "कैंसल करो", "रहने दो", "छोड़ो", "छोडो",
      ].sort(),
    );
  });

  it("the pause list", () => {
    expect([...PAUSE_PHRASES].sort()).toEqual(["ruko", "rukiye", "wait", "रुको", "रुकिए"].sort());
  });
});

describe("normalizeUtterance", () => {
  it.each([
    ["  Haan,  BHEJO!! ", "haan bhejo"],
    ["हां", "हाँ"],
    ["हां भेज दो।", "हाँ भेज दो"],
    ["haan… ruko", "haan ruko"],
    ['"Ok" bhejo?', "ok bhejo"],
    ["It's already 300 rupees.", "its already 300 rupees"],
  ])("%j → %j", (input, expected) => {
    expect(normalizeUtterance(input)).toBe(expected);
  });
});

describe("strict yes (no server call)", () => {
  it.each([["haan"], ["हां"], ["Ok bhejo!"]])("#1–3 %j → confirm", (said) => {
    expect(hear(said)).toEqual({ askedServer: false, decision: confirm });
  });

  it.each([["haan ji"], ["haanji"], ["yes please"], ["yes send"], ["yes send it"], ["haan bhej do"]])(
    "#4 %j → confirm",
    (said) => {
      expect(hear(said)).toEqual({ askedServer: false, decision: confirm });
    },
  );

  it.each([["हाँ जी"], ["हां भेज दो"]])("#5 %j → confirm", (said) => {
    expect(hear(said)).toEqual({ askedServer: false, decision: confirm });
  });

  it.each([["theek hai"], ["haan haan"]])("#6 %j is not on the list → server → not clear", (said) => {
    expect(hear(said, { turn: { kind: "other" } })).toEqual({ askedServer: true, decision: notClear });
  });

  it('#13 "haan bhejo na": a trailing na is a softener → confirm', () => {
    expect(hear("haan bhejo na")).toEqual({ askedServer: false, decision: confirm });
  });
});

describe("yes + change, compared with the card in code", () => {
  it('#7 "Haan, 300 kar do" on a ₹300 card → confirm', () => {
    expect(hear("Haan, 300 kar do", { turn: same300 })).toEqual({ askedServer: true, decision: confirm });
  });

  it('#8 "Haan, 300 kar do" on a ₹500 card → new ₹300 card (the ₹500 one is never confirmed)', () => {
    expect(hear("Haan, 300 kar do", { card: card({ paise: 50000 }), turn: same300 }).decision).toEqual({
      kind: "newCard",
      payeeId: MUMMY,
      paise: 30000,
    });
  });

  it('#11 "हाँ, ३०० कर दो" on a ₹300 card → confirm', () => {
    expect(hear("हाँ, ३०० कर दो", { turn: same300 }).decision).toEqual(confirm);
  });

  it('#45 "Haan, Papa ko 300" on Mummy\'s ₹300 card → new card for Papa', () => {
    expect(hear("Haan, Papa ko 300", { turn: { kind: "change", payeeId: PAPA, paise: 30000 } }).decision).toEqual({
      kind: "newCard",
      payeeId: PAPA,
      paise: 30000,
    });
  });

  it("a change with no yes-word and different values → new card", () => {
    expect(hear("nahi, teen sau kar do", { card: card({ paise: 50000 }), turn: same300 }).decision).toEqual({
      kind: "newCard",
      payeeId: MUMMY,
      paise: 30000,
    });
  });

  it("#44 server or network down → not clear (never a confirm)", () => {
    expect(hear("Haan, 300 kar do", { turn: { kind: "failed" } }).decision).toEqual(notClear);
  });

  it('a relative amount ("100 kam kar do") → not clear + "say the full amount"', () => {
    expect(hear("100 kam kar do", { turn: { kind: "relative" } }).decision).toEqual({
      kind: "notClear",
      hint: "fullAmount",
    });
  });
});

describe("same values without a leading yes → re-ask, at most twice", () => {
  it('#9 "300 kar do" on a ₹300 card → re-ask (mic reopens), no new card', () => {
    expect(hear("300 kar do", { turn: same300 }).decision).toEqual({ kind: "reask", paise: 30000 });
  });

  it("#10 the third time → tap only (mic stays closed)", () => {
    expect(hear("300 kar do", { card: card({ reasks: 0 }), turn: same300 }).decision.kind).toBe("reask");
    expect(hear("300 kar do", { card: card({ reasks: 1 }), turn: same300 }).decision.kind).toBe("reask");
    expect(hear("300 kar do", { card: card({ reasks: 2 }), turn: same300 }).decision).toEqual({ kind: "tapOnly" });
  });

  it('#12 "300 kar do, haan": the yes-word must come first → re-ask', () => {
    expect(hear("300 kar do, haan", { turn: same300 }).decision).toEqual({ kind: "reask", paise: 30000 });
  });

  it('#35 a plain "yes" right after the re-ask → confirm (one word is never echo)', () => {
    expect(hear("yes", { lastSpoken: REASK_300 })).toEqual({ askedServer: false, decision: confirm });
  });
});

describe("partial yes and negations never confirm", () => {
  it('#14 "haan na bhejo": na before the verb is a negation → not clear', () => {
    expect(hear("haan na bhejo", { turn: { kind: "other" } }).decision).toEqual(notClear);
  });

  it.each([["haan… ruko"], ["haan nahi"], ["yes but wait"]])("#15–17 %j → not clear", (said) => {
    expect(hear(said, { turn: { kind: "other" } }).decision).toEqual(notClear);
  });

  it('#18 "haan 300 mat karo" on a ₹300 card → not clear, even though /turn saw ₹300', () => {
    expect(hear("haan 300 mat karo", { turn: same300 }).decision).toEqual(notClear);
  });
});

describe("cancel (no server call, works offline)", () => {
  it.each([["nahi"], ["cancel"], ["नहीं"], ["na"], ["no"]])("#19–20 %j → cancel", (said) => {
    expect(hear(said)).toEqual({ askedServer: false, decision: cancel });
  });

  it.each([["nahi bhejo"], ["mat bhejo"], ["cancel karo"], ["rehne do"], ["chhodo"]])("#21 %j → cancel", (said) => {
    expect(hear(said)).toEqual({ askedServer: false, decision: cancel });
  });

  it.each([["नहीं भेजो"], ["मत भेजो"], ["कैंसल करो"], ["रहने दो"], ["छोड़ो"]])("#22 %j → cancel", (said) => {
    expect(hear(said)).toEqual({ askedServer: false, decision: cancel });
  });

  it('#23 "mat bhejo na" → cancel (softener dropped first)', () => {
    expect(hear("mat bhejo na")).toEqual({ askedServer: false, decision: cancel });
  });

  it('#24 "nahi" never needs the server, so it works with the server down', () => {
    expect(hear("nahi").askedServer).toBe(false);
  });
});

describe("pause (no server call)", () => {
  it.each([["ruko"], ["wait"], ["रुको"], ["ruko na"]])("#25 %j alone → pause", (said) => {
    expect(hear(said)).toEqual({ askedServer: false, decision: { kind: "pause" } });
  });

  it('#26 after a pause, tap the mic → "haan" → confirm', () => {
    expect(hear("haan", { lastSpoken: PAUSED }).decision).toEqual(confirm);
  });

  it('#27 after a pause, tap the mic → "nahi" → cancel', () => {
    expect(hear("nahi", { lastSpoken: PAUSED }).decision).toEqual(cancel);
  });
});

describe("late, stale and echoed results are ignored", () => {
  it("#28 finalized at 5.3 s → ignored", () => {
    expect(hear("haan", { atMs: 5300 }).decision).toEqual({ kind: "ignore" });
  });

  it("#29 finalized at 4.6 s → confirm; exactly 5 s still counts, 5.001 s doesn't", () => {
    expect(hear("haan", { atMs: 4600 }).decision).toEqual(confirm);
    expect(hear("haan", { atMs: LISTEN_WINDOW_MS }).decision).toEqual(confirm);
    expect(hear("haan", { atMs: LISTEN_WINDOW_MS + 1 }).decision).toEqual({ kind: "ignore" });
  });

  it("#30 a result for a card that was replaced → ignored", () => {
    expect(hear("haan", { currentTxnRef: "FP2" }).decision).toEqual({ kind: "ignore" });
  });

  it("#31 a result for a card that was already cancelled or confirmed (lock used) → ignored", () => {
    expect(hear("haan", { used: true }).decision).toEqual({ kind: "ignore" });
  });

  it.each([
    ["#32", "send 300 rupees to mummy", ASK_300],
    ["#33", "it's already 300 rupees say yes to send", REASK_300],
    ["#34", "okay tap the mic when you're ready", PAUSED],
    ["part of it", "say yes to send", REASK_300],
  ])("%s echo of our own speech → ignored, no server call", (_n, said, lastSpoken) => {
    expect(hear(said, { lastSpoken })).toEqual({ askedServer: false, decision: { kind: "ignore" } });
  });

  it("#42 silence (empty transcript) → nothing", () => {
    expect(hear("   ").decision).toEqual({ kind: "ignore" });
  });
});

describe("red cards never confirm", () => {
  const red = (offerPaise?: number) => card({ tone: "red", paise: 250000, offerPaise });

  it('#36 red, no offer: "haan" → not clear', () => {
    expect(hear("haan", { card: red() }).decision).toEqual(notClear);
  });

  it('#37 red with a ₹2,000 offer: "haan" → a new ₹2,000 card that asks again', () => {
    expect(hear("haan", { card: red(200000) }).decision).toEqual({ kind: "newCard", payeeId: MUMMY, paise: 200000 });
  });

  it('#38 red with an offer: "nahi" → cancel', () => {
    expect(hear("nahi", { card: red(200000) }).decision).toEqual(cancel);
  });

  it("red: a yes + change to the same values → not clear", () => {
    expect(hear("haan 2500 kar do", { card: red(), turn: { kind: "change", payeeId: MUMMY, paise: 250000 } }).decision).toEqual(
      notClear,
    );
  });

  it("red: a change to different values → new card (which runs the rules again)", () => {
    expect(hear("2000 kar do", { card: red(), turn: { kind: "change", payeeId: MUMMY, paise: 200000 } }).decision).toEqual({
      kind: "newCard",
      payeeId: MUMMY,
      paise: 200000,
    });
  });
});

describe("amber cards need a second spoken yes", () => {
  const amber = (amberStep: 1 | 2) => card({ tone: "amber", amberStep });

  it('#39 "haan" → "Are you sure? Say yes again." → "haan" → confirm', () => {
    expect(hear("haan", { card: amber(1) }).decision).toEqual({ kind: "askAgain" });
    expect(hear("haan", { card: amber(2) }).decision).toEqual(confirm);
  });

  it("first step: a yes + change to the same values → asks again too", () => {
    expect(hear("Haan, 300 kar do", { card: amber(1), turn: same300 }).decision).toEqual({ kind: "askAgain" });
  });

  it('#40 second step: "Haan, 300 kar do" → not clear (only the strict list counts)', () => {
    expect(hear("Haan, 300 kar do", { card: amber(2), turn: same300 }).decision).toEqual(notClear);
  });

  it('#41 second step: "nahi" → cancel', () => {
    expect(hear("nahi", { card: amber(2) }).decision).toEqual(cancel);
  });

  it("second step: a change to different values → new card", () => {
    expect(hear("500 kar do", { card: amber(2), turn: { kind: "change", payeeId: MUMMY, paise: 50000 } }).decision).toEqual({
      kind: "newCard",
      payeeId: MUMMY,
      paise: 50000,
    });
  });
});

describe("carried over from the M8b voice-yes tests: these never confirm", () => {
  it.each([
    ["no"], ["nahi"], ["नहीं"], ["yes no"], ["haan nahi"], ["yeah"], ["send it"], ["ok"],
    ["haan haan"], ["yesterday"], ["send 500 rupees to mummy yes"],
  ])("%j (even if /turn wrongly reported the card's own payee + amount)", (said) => {
    for (const turn of [{ kind: "other" } as const, same300, { kind: "failed" } as const]) {
      const { decision } = hear(said, { turn, lastSpoken: "" });
      expect(decision.kind).not.toBe("confirm");
    }
  });

  it('"yes but send 1000" → a new ₹1,000 card, never a confirm of the ₹300 one', () => {
    const turn = { kind: "change", payeeId: MUMMY, paise: 100000 } as const;
    expect(hear("yes but send 1000", { turn }).decision).toEqual({ kind: "newCard", payeeId: MUMMY, paise: 100000 });
  });

  it.each([["ok"], ["haan haan"], ["yes yes"]])("%j: yes-words with no change in them → not clear", (said) => {
    expect(hear(said, { turn: same300 }).decision).toEqual(notClear);
  });
});

// M13: the reminder card ("Remind you on 1 Nov to send ₹2,000 to Mummy?") is saved by a strict yes or
// a tap on Save. Same listening rules as the Confirm card; nothing here pays, and nothing goes to the
// server: a change is said again on Home.
describe("decideSaveVoice (reminder card)", () => {
  const ASK = "Remind you on 1 Nov to send 2000 rupees to Mummy?";
  const save = (transcript: string, o: { atMs?: number; lastSpoken?: string; used?: boolean; currentId?: string } = {}) =>
    decideSaveVoice({
      cardId: "draft-1",
      currentId: o.currentId ?? "draft-1",
      used: o.used ?? false,
      heard: { transcript, forId: "draft-1", listenStartedAt: T, resultAt: T + (o.atMs ?? 1500), lastSpoken: o.lastSpoken ?? ASK },
    });

  it.each([["haan"], ["हां"], ["haan ji"], ["yes please"], ["ok bhejo"], ["haan bhejo na"]])("%j → save", (said) => {
    expect(save(said)).toEqual({ kind: "save" });
  });

  it.each([["nahi"], ["rehne do"], ["mat bhejo"], ["नहीं"], ["na"]])("%j → cancel", (said) => {
    expect(save(said)).toEqual({ kind: "cancel" });
  });

  it.each([["ruko"], ["wait"]])("%j → pause", (said) => {
    expect(save(said)).toEqual({ kind: "pause" });
  });

  it.each([["theek hai"], ["haan nahi"], ["haan, 3000 kar do"], ["2 tareekh ko"], ["haan haan"]])(
    "%j → not clear (no server call: say the change on Home)",
    (said) => {
      expect(save(said)).toEqual({ kind: "notClear" });
    },
  );

  it("late (after 5 s), echoed, empty, for an old card or an already-saved one → ignored", () => {
    expect(save("haan", { atMs: LISTEN_WINDOW_MS + 1 })).toEqual({ kind: "ignore" });
    expect(save("send 2000 rupees to mummy")).toEqual({ kind: "ignore" });
    expect(save("   ")).toEqual({ kind: "ignore" });
    expect(save("haan", { currentId: "draft-2" })).toEqual({ kind: "ignore" });
    expect(save("haan", { used: true })).toEqual({ kind: "ignore" });
  });
});

// #43 ("haan" + tap Yes at the same moment → one launch) is the persisted confirm lock, tested in
// screens-logic.test.ts ("two taps in the same moment → only one wins"): voice and tap call the same
// locked yes().
