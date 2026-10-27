// M15: preferences, nicknames ("Maa matlab Mummy") and "Kyun block hua?" explanations. All pure.
import { planActions } from "../agent";
import { checkAlias } from "../alias";
import { IDLE_DROP_MS, isIdle } from "../conversation";
import { OUTCOME_TTL_MS, createOutcomeStore, explainOutcome, type Outcome } from "../explain";
import { formatRupees, spokenRupees } from "../format";
import { DEFAULT_PREFS, applyPreference, createPreferenceStore, pickSpeechLang } from "../preferences";
import { speechTexts } from "../speech";
import { strings } from "../strings";
import { CANCEL_PHRASES, STRICT_YES, normalizeUtterance } from "../voiceConfirm";
import { MUMMY, PAPA, PAYEES, RAHUL_SHARMA, memoryStore } from "./fixtures";

describe("preferences", () => {
  it.each([
    [{ key: "reply_language", value: "hindi" }, { ...DEFAULT_PREFS, replyLanguage: "hi" }],
    [{ key: "reply_language", value: "english" }, { ...DEFAULT_PREFS, replyLanguage: "en" }],
    [{ key: "reply_language", value: "auto" }, DEFAULT_PREFS],
    [{ key: "speak_replies", value: "off" }, { ...DEFAULT_PREFS, speakReplies: false }],
    [{ key: "speak_replies", value: "on" }, DEFAULT_PREFS],
  ] as const)("%j → %j", (change, prefs) => {
    expect(applyPreference(DEFAULT_PREFS, change)).toEqual({ prefs });
  });

  it("mic_language changes the mic, not the prefs", () => {
    expect(applyPreference(DEFAULT_PREFS, { key: "mic_language", value: "hindi" })).toEqual({ prefs: DEFAULT_PREFS, micLang: "hi-IN" });
    expect(applyPreference(DEFAULT_PREFS, { key: "mic_language", value: "english" })).toEqual({ prefs: DEFAULT_PREFS, micLang: "en-IN" });
  });

  it.each([
    [{ key: "reply_language", value: "on" }],
    [{ key: "speak_replies", value: "hindi" }],
    [{ key: "mic_language", value: "auto" }],
    [{ key: "daily_limit", value: "off" }],
  ])("a pair that doesn't fit changes nothing: %j", (change) => {
    expect(applyPreference(DEFAULT_PREFS, change as never)).toBeNull();
  });

  it.each([
    ["auto", "en-IN", true, "en-IN"],
    ["auto", "hi-IN", true, "hi-IN"],
    ["auto", "hi-IN", false, "en-IN"],
    ["hi", "en-IN", true, "hi-IN"],
    ["hi", "en-IN", false, "en-IN"], // no Hindi voice: never silent or garbled
    ["en", "hi-IN", true, "en-IN"],
  ] as const)("reply %s, mic %s, Hindi voice %s → speak %s", (replyLanguage, micLang, hasHindiVoice, expected) => {
    expect(pickSpeechLang({ replyLanguage, micLang, hasHindiVoice })).toBe(expected);
  });

  it("the store survives a restart; unreadable data → defaults", async () => {
    const kv = memoryStore();
    await createPreferenceStore(kv).set({ replyLanguage: "hi", speakReplies: false });
    expect(await createPreferenceStore(kv).load()).toEqual({ replyLanguage: "hi", speakReplies: false });
    expect(await createPreferenceStore(memoryStore({ "flowpay.prefs.v1": "{bad" })).load()).toEqual(DEFAULT_PREFS);
    expect(await createPreferenceStore(memoryStore({ "flowpay.prefs.v1": '{"replyLanguage":"fr","speakReplies":1}' })).load()).toEqual(DEFAULT_PREFS);
  });

  it("every change has a spoken confirmation in both languages", () => {
    for (const [k, v] of Object.keys(strings.prefs.changed).map((x) => x.split(":") as [string, string])) {
      expect(speechTexts("en-IN").prefChanged(k, v)).toBe(strings.prefs.changed[`${k}:${v}`]);
      expect(speechTexts("hi-IN").prefChanged(k, v)).toMatch(/[ऀ-ॿ]/);
    }
  });
});

describe("checkAlias: may this name be added to that payee?", () => {
  it('"Sunita matlab Mummy" when "sunita" is new → ok', () => {
    expect(checkAlias("Sunita", "Mummy", PAYEES)).toEqual({ ok: true, payee: MUMMY, alias: "sunita" });
  });

  it('"Maa" already reaches Mummy (relationship words are understood) → already', () => {
    expect(checkAlias("Maa", "Mummy", [{ ...MUMMY, aliases: [] }, PAPA])).toEqual({ ok: false, reason: "already" });
  });

  it("a name this payee already has → already", () => {
    expect(checkAlias("mumma", "Mummy", PAYEES)).toEqual({ ok: false, reason: "already" });
    expect(checkAlias("Mummy", "maa", PAYEES)).toEqual({ ok: false, reason: "already" });
  });

  it("a name that already reaches ANOTHER payee → refused (it could pay the wrong person)", () => {
    expect(checkAlias("Papa", "Mummy", PAYEES)).toEqual({ ok: false, reason: "usedByOther" });
    expect(checkAlias("Rahul", "Mummy", PAYEES)).toEqual({ ok: false, reason: "usedByOther" });
  });

  it("an unknown or ambiguous target → refused", () => {
    expect(checkAlias("Sharmaji", "Sharma ji", PAYEES)).toEqual({ ok: false, reason: "noPayee" });
    expect(checkAlias("bhaiya", "Rahul", PAYEES)).toEqual({ ok: false, reason: "many" });
    expect(checkAlias("bhaiya", "Rahul Sharma", PAYEES)).toEqual({ ok: true, payee: RAHUL_SHARMA, alias: "bhaiya" });
  });

  it("an empty or too long name, or too many names → refused", () => {
    expect(checkAlias("  ", "Mummy", PAYEES)).toEqual({ ok: false, reason: "invalid" });
    expect(checkAlias("x".repeat(51), "Mummy", PAYEES)).toEqual({ ok: false, reason: "invalid" });
    const full = { ...MUMMY, aliases: Array.from({ length: 10 }, (_, i) => `name${i}`) };
    expect(checkAlias("ammi", "Mummy", [full, PAPA])).toEqual({ ok: false, reason: "tooMany" });
  });
});

describe('explainOutcome: "Kyun block hua?" with the phone\'s own numbers', () => {
  const en = (o: Outcome | null) => explainOutcome(o, strings.explain, formatRupees);
  const blocked = (reason: Extract<Outcome, { kind: "blocked" }>["reason"], extra = {}): Outcome => ({
    kind: "blocked",
    reason,
    payeeName: "Mummy",
    amountPaise: 400000,
    sentTodayPaise: 300000,
    leftTodayPaise: 200000,
    ...extra,
  });

  it("over the per-payment limit", () => {
    expect(en(blocked("OVER_PER_PAYMENT"))).toBe("₹4,000 to Mummy was stopped: one payment can be at most ₹3,000.");
  });

  it("over the daily limit: what was sent and what is left", () => {
    expect(en(blocked("OVER_DAILY"))).toBe("₹4,000 to Mummy was stopped: ₹3,000 was already sent today, and only ₹2,000 is left of the daily limit.");
  });

  it("a new payee", () => {
    expect(en(blocked("NEW_PAYEE_LIMIT", { amountPaise: 100000, newPayeeHours: 5 }))).toBe(
      "₹1,000 to Mummy was stopped: Mummy was added or got a new UPI ID recently, so at most ₹500 per payment for 5 more hours.",
    );
  });

  it("the name she said, when it reached the payee through another name", () => {
    expect(en(blocked("OVER_PER_PAYMENT", { spokenName: "maa" }))).toBe(
      '₹4,000 to Mummy was stopped: one payment can be at most ₹3,000. You said "maa", which is saved as Mummy.',
    );
    expect(en(blocked("OVER_PER_PAYMENT", { spokenName: "mummy" }))).not.toContain("You said");
  });

  it.each<[Outcome | null, string]>([
    [null, strings.explain.nothing],
    [{ kind: "noPayee", name: "Sharma ji" }, "Sharma ji isn't among your saved payees."],
    [{ kind: "relative" }, strings.explain.relative],
    [{ kind: "screened" }, strings.explain.screened],
    [{ kind: "failed" }, strings.explain.failed],
    [{ kind: "paid", status: "success", payeeName: "Papa", amountPaise: 30000, launchFailed: false }, "The last payment went through: ₹300 to Papa."],
    [{ kind: "paid", status: "failed", payeeName: "Papa", amountPaise: 30000, launchFailed: true }, strings.explain.noUpiApp],
  ])("%j", (o, text) => {
    expect(en(o)).toBe(text);
  });

  it("spoken: amounts as words-friendly digits, never a ₹ sign; Hindi in Devanagari", () => {
    const spokenEn = explainOutcome(blocked("OVER_DAILY"), speechTexts("en-IN").explain, spokenRupees);
    expect(spokenEn).toContain("4000 rupees");
    expect(spokenEn).not.toContain("₹");
    const hi = speechTexts("hi-IN");
    const spokenHi = explainOutcome(blocked("OVER_DAILY", { spokenName: "माँ" }), hi.explain, hi.rupees);
    expect(spokenHi).toMatch(/[ऀ-ॿ]/);
    expect(spokenHi).toContain("4000 रुपये");
    expect(spokenHi).not.toContain("₹");
  });

  it("the record is kept 10 minutes, then dropped", () => {
    let t = 0;
    const store = createOutcomeStore(() => t);
    store.set({ kind: "relative" });
    t = OUTCOME_TTL_MS;
    expect(store.get()).toEqual({ kind: "relative" });
    t = OUTCOME_TTL_MS + 1;
    expect(store.get()).toBeNull();
  });
});

describe("the conversation is dropped after 10 minutes idle", () => {
  it("isIdle", () => {
    expect(isIdle(0, IDLE_DROP_MS)).toBe(false);
    expect(isIdle(0, IDLE_DROP_MS + 1)).toBe(true);
  });
});

describe("planActions with M15 actions", () => {
  it("each becomes the special action; nothing else is needed", () => {
    expect(planActions([{ action: "set_preference", key: "reply_language", value: "hindi" }])).toEqual({
      reset: false,
      queue: [],
      special: { kind: "preference", change: { key: "reply_language", value: "hindi" } },
    });
    expect(planActions([{ action: "suggest_alias", alias: "Maa", name: "Mummy" }]).special).toEqual({ kind: "alias", alias: "Maa", name: "Mummy" });
    expect(planActions([{ action: "explain_last" }]).special).toEqual({ kind: "explain" });
  });
});

describe("M15 spoken lines never end with an answer word", () => {
  it("both languages", () => {
    const answerWords = new Set([...STRICT_YES.filter((p) => !p.includes(" ")), ...CANCEL_PHRASES.filter((p) => !p.includes(" "))].map((w) => normalizeUtterance(w)));
    for (const lang of ["en-IN", "hi-IN"] as const) {
      const t = speechTexts(lang);
      const lines = [
        t.aliasAsk("maa", "Mummy"),
        t.aliasSaved("maa", "Mummy"),
        ...(["noPayee", "many", "invalid", "already", "usedByOther", "tooMany"] as const).map((r) => t.aliasRefused(r, "maa", "Mummy")),
        ...Object.keys(strings.prefs.changed).map((k) => t.prefChanged(...(k.split(":") as [string, string]))),
        t.explain.nothing,
        t.explain.relative,
        t.explain.unsure("500 rupees", "Mummy"),
      ];
      for (const line of lines) expect(answerWords.has(normalizeUtterance(line).split(" ").at(-1)!)).toBe(false);
    }
  });
});
