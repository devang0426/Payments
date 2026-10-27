import { speechTexts } from "../speech";
import { strings } from "../strings";
import { CANCEL_PHRASES, STRICT_YES, normalizeUtterance } from "../voiceConfirm";

const EN = speechTexts("en-IN");
const HI = speechTexts("hi-IN");
const NOV_1 = Date.parse("2026-11-01T09:00:00+05:30");

describe("spoken texts (M11)", () => {
  it("English is exactly what the app already said before M11", () => {
    expect(EN.questions).toEqual(strings.conversation);
    expect(EN.confirm("500 rupees", "Mummy")).toBe(strings.speech.confirm("500 rupees", "Mummy"));
    expect(EN.rules).toEqual(strings.speech.rules);
    expect(EN.rupees(50000)).toBe("500 rupees");
  });

  it("Hindi has every question and every rule reason", () => {
    expect(Object.keys(HI.questions).sort()).toEqual(Object.keys(EN.questions).sort());
    expect(Object.keys(HI.rules).sort()).toEqual(Object.keys(EN.rules).sort());
    for (const text of [...Object.values(HI.questions), ...Object.values(HI.rules)]) expect(text).toMatch(/[ऀ-ॿ]/);
  });

  it.each([
    [50000, "500 रुपये"],
    [100, "1 रुपया"],
    [50, "50 पैसे"],
    [10150, "101 रुपये 50 पैसे"],
  ])("Hindi amount %i paise → %j", (paise, spoken) => {
    expect(HI.rupees(paise)).toBe(spoken);
  });

  it("the Hindi confirm question names the payee and the amount", () => {
    expect(HI.confirm(HI.rupees(50000), "मम्मी")).toBe("मम्मी को 500 रुपये भेजें?");
  });

  it("the amounts in the limits are the same in both languages (₹3,000 / ₹500 / ₹5,000)", () => {
    expect(HI.rules.OVER_PER_PAYMENT).toContain("3000");
    expect(HI.rules.NEW_PAYEE_LIMIT).toContain("500");
    expect(HI.rules.OVER_DAILY).toContain("5000");
  });

  // Echo guard: if the mic catches the last word of our own prompt, it must not read as an answer.
  it("no prompt, in either language, ends with a yes-word or a cancel word", () => {
    const answerWords = new Set([...STRICT_YES.filter((p) => !p.includes(" ")), ...CANCEL_PHRASES.filter((p) => !p.includes(" "))].map((w) => normalizeUtterance(w)));
    for (const t of [EN, HI]) {
      const prompts = [
        ...Object.values(t.questions),
        t.confirm(t.rupees(30000), "Mummy"),
        ...Object.values(t.rules),
        t.dailyRemaining(t.rupees(20000)),
        t.noPrevious("Mummy"),
        t.cancelled,
        t.paused,
        t.reask(t.rupees(30000)),
        t.tapOnly,
        t.askAgain,
        t.offer(t.rupees(200000)),
        // M13
        ...Object.values(t.warnings).map((w) => w("Mummy")),
        t.reminderAsk(t.when({ kind: "dayOfMonth", day: 1 }, NOV_1), "Mummy", t.rupees(200000)),
        t.reminderAsk(t.when({ kind: "monthly", day: 1 }, NOV_1), "Mummy", null),
        t.reminderSaved,
        t.blocked,
      ];
      for (const prompt of prompts) {
        const last = normalizeUtterance(prompt).split(" ").at(-1)!;
        expect(answerWords.has(last)).toBe(false);
      }
    }
  });
});

describe("spoken texts (M13)", () => {
  it("amber warnings exist in both languages, spoken after the question", () => {
    expect(Object.keys(EN.warnings).sort()).toEqual(["FIRST_PAYMENT", "LATE_NIGHT", "UNUSUAL_AMOUNT"]);
    expect(Object.keys(HI.warnings).sort()).toEqual(Object.keys(EN.warnings).sort());
    expect(EN.warnings.FIRST_PAYMENT("Mummy")).toBe("This is your first payment to Mummy.");
    expect(EN.warnings.UNUSUAL_AMOUNT("Mummy")).toBe("This is much more than you usually send to Mummy.");
    expect(EN.warnings.LATE_NIGHT("Mummy")).toBe("It's very late at night.");
    for (const w of Object.values(HI.warnings)) expect(w("मम्मी")).toMatch(/[ऀ-ॿ]/);
  });

  it("warnings never contain an amount (the card's amount is said once, in the question)", () => {
    for (const t of [EN, HI]) for (const w of Object.values(t.warnings)) expect(w("Mummy")).not.toMatch(/\d/);
  });

  it.each([
    [{ kind: "dayOfMonth", day: 1 }, "on 1 November", "1 नवंबर को"],
    [{ kind: "inDays", days: 1 }, "on 1 November", "1 नवंबर को"],
    [{ kind: "monthly", day: 1 }, "every month on the 1st", "हर महीने 1 तारीख को"],
  ] as const)("when %j → %j / %j", (when, en, hi) => {
    expect(EN.when(when, NOV_1)).toBe(en);
    expect(HI.when(when, NOV_1)).toBe(hi);
  });

  it.each([
    [2, "every month on the 2nd"],
    [3, "every month on the 3rd"],
    [11, "every month on the 11th"],
    [21, "every month on the 21st"],
    [22, "every month on the 22nd"],
  ])("ordinals: day %i → %j", (day, text) => {
    expect(EN.when({ kind: "monthly", day }, NOV_1)).toBe(text);
  });

  it("the reminder question", () => {
    const w = EN.when({ kind: "dayOfMonth", day: 1 }, NOV_1);
    expect(EN.reminderAsk(w, "Mummy", EN.rupees(200000))).toBe("Remind you on 1 November to send 2000 rupees to Mummy?");
    expect(EN.reminderAsk(w, "Mummy", null)).toBe("Remind you on 1 November to send money to Mummy?");
    expect(HI.reminderAsk(HI.when({ kind: "dayOfMonth", day: 1 }, NOV_1), "मम्मी", HI.rupees(200000))).toBe(
      "1 नवंबर को मम्मी को 2000 रुपये भेजने की याद दिलाऊँ?",
    );
  });

  it("blocked text (a UPI ID or phone number) gets the fixed local answer", () => {
    expect(EN.blocked).toBe("I can only pay saved payees. Add new ones in Settings.");
    expect(HI.blocked).toMatch(/[ऀ-ॿ]/);
  });
});
