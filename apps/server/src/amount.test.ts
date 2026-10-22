import { describe, expect, it } from "vitest";
import { parseAmount } from "./amount.js";

// parseAmount(amountText) → { ok: true, paise } | { ok: false, reason }
// Input is only the amount part of a spoken command (the AI extracts it, M2).
// Paise are always integers: ₹1 = 100.

function expectPaise(input: string, paise: number) {
  const result = parseAmount(input);
  expect(result, `input: ${JSON.stringify(input)}`).toEqual({ ok: true, paise });
  if (result.ok) expect(Number.isInteger(result.paise)).toBe(true);
}

function expectFail(input: string) {
  const result = parseAmount(input);
  expect(result.ok, `input: ${JSON.stringify(input)}`).toBe(false);
  if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
}

describe("digits", () => {
  it.each([
    ["500", 50000],
    ["₹500", 50000],
    ["Rs 500", 50000],
    ["rs.500", 50000],
    ["500 rupaye", 50000],
    ["500 rs", 50000],
    ["1,500", 150000],
    ["1,50,000", 15000000], // Indian digit grouping
    ["250.50", 25050],
    ["500.5", 50050], // one decimal = tens of paise
    ["0.50", 50],
    ["  500  ", 50000],
  ])("%j → %i paise", (input, paise) => expectPaise(input, paise));
});

describe("currency words", () => {
  it.each([
    ["ek rupaya", 100],
    ["500 rupiya", 50000],
    ["500 rupees", 50000],
    ["500 rupay", 50000],
    ["₹500 rupaye", 50000],
  ])("%j → %i paise", (input, paise) => expectPaise(input, paise));
});

describe("Devanagari digits", () => {
  it.each([
    ["५००", 50000],
    ["₹५००", 50000],
    ["१,५००", 150000],
  ])("%j → %i paise", (input, paise) => expectPaise(input, paise));
});

describe("Hindi number words 1–10, 20, 50, 100, 1000", () => {
  it.each([
    ["ek", 100],
    ["do", 200],
    ["teen", 300],
    ["chaar", 400],
    ["paanch", 500],
    ["chhe", 600],
    ["saat", 700],
    ["aath", 800],
    ["nau", 900],
    ["das", 1000],
    ["bees", 2000],
    ["pachaas", 5000],
    ["sau", 10000],
    ["hazaar", 100000],
    ["hajar", 100000],
    ["hazar", 100000],
  ])("%j → %i paise", (input, paise) => expectPaise(input, paise));
});

describe("Hindi number words 11–99", () => {
  it.each([
    ["gyarah", 1100],
    ["pachees", 2500],
    ["tees", 3000],
    ["chaalees", 4000],
    ["pachattar", 7500],
    ["ninyanve", 9900],
    ["ek sau pachees", 12500],
  ])("%j → %i paise", (input, paise) => expectPaise(input, paise));
});

describe("combinations", () => {
  it.each([
    ["paanch sau", 50000],
    ["do hazaar", 200000],
    ["do hazaar paanch sau", 250000],
    ["ek sau bees", 12000],
    ["ek hazaar do sau", 120000], // "do" in the middle is the number 2
    ["PAANCH SAU", 50000],
  ])("%j → %i paise", (input, paise) => expectPaise(input, paise));
});

describe("lakh (parsed correctly; limits are checked on the phone)", () => {
  it.each([
    ["ek lakh", 10000000],
    ["1 lakh", 10000000],
    ["dedh lakh", 15000000],
    ["do laakh", 20000000],
    ["ek lac", 10000000],
  ])("%j → %i paise", (input, paise) => expectPaise(input, paise));
});

describe("fractions", () => {
  it.each([
    ["dedh sau", 15000], // 1.5 × 100
    ["dhai sau", 25000], // 2.5 × 100
    ["saadhe teen sau", 35000], // 3.5 × 100
    ["sawa sau", 12500], // 1.25 × 100
    ["paune do sau", 17500], // 1.75 × 100
    ["dedh hazaar", 150000],
  ])("%j → %i paise", (input, paise) => expectPaise(input, paise));
});

describe("digits mixed with multipliers", () => {
  it.each([
    ["5 sau", 50000],
    ["2 hazaar", 200000],
    ["2 hazaar 500", 250000],
    ["1.5 sau", 15000],
    ["1.5k", 150000],
    ["2k", 200000],
  ])("%j → %i paise", (input, paise) => expectPaise(input, paise));
});

describe("spelling variants", () => {
  it.each([
    ["paach sau", 50000],
    ["panch sau", 50000],
    ["dhaai sau", 25000],
    ["sade teen sau", 35000],
    ["saade teen sau", 35000],
  ])("%j → %i paise", (input, paise) => expectPaise(input, paise));
});

describe('ambiguity: a trailing "do" is the verb "give"', () => {
  it.each([
    ["paanch sau do", 50000],
    ["do sau do", 20000],
    ["ek sau do", 10000], // not ₹102: say "102" with digits for that
    ["500 do", 50000],
    ["do hazaar do", 200000],
    ["do", 200], // alone, "do" is the number 2
  ])("%j → %i paise", (input, paise) => expectPaise(input, paise));
});

describe('ambiguity: "saat" (7) vs "saath" (60)', () => {
  it.each([
    ["saat", 700],
    ["saath", 6000],
    ["saat sau", 70000],
    ["saath sau", 600000], // 60 × 100 = ₹6,000
  ])("%j → %i paise", (input, paise) => expectPaise(input, paise));
});

describe("failures (ok: false)", () => {
  it.each([
    [""],
    ["   "],
    ["kuch paise"], // "some money"
    ["bahut saare"], // "a lot"
    ["0"],
    ["0.00"],
    ["-500"],
    ["500 ya 600"], // two amounts ("500 or 600")
    ["500 600"],
    ["1.005"], // more than 2 decimals
    ["500 bhejo"], // unknown word: the parser only accepts amount words
    ["sau sau"],
  ])("%j", (input) => expectFail(input));
});

// M11: the हिं mic writes Devanagari, so number words are read in Devanagari too. Same values and the
// same strictness as the Latin words above.
describe("Devanagari number words (M11)", () => {
  it.each([
    // the two inputs that failed on purpose before M11
    ["पांच सौ", 50000],
    ["दो हज़ार", 200000],
    // chandrabindu ँ and anusvara ं are the same; nukta ़ is optional (हज़ार / हजार)
    ["पाँच सौ", 50000],
    ["दो हजार", 200000],
    ["दो हज़ार पाँच सौ", 250000],
    ["एक लाख", 10000000],
    ["एक", 100],
    ["दस", 1000],
    ["पचास", 5000],
    ["पच्चीस", 2500],
    ["निन्यानवे", 9900],
    ["एक सौ पच्चीस", 12500],
    ["सात सौ", 70000], // सात 7
    ["साठ", 6000], // साठ 60: different letters, no saat/saath trap
    ["छह सौ", 60000],
    ["छः सौ", 60000],
    ["पंद्रह सौ", 150000],
    ["पन्द्रह सौ", 150000],
  ])("%j → %i", (input, paise) => expectPaise(input, paise));
});

describe("Devanagari fractions and prefixes (M11)", () => {
  it.each([
    ["डेढ़ सौ", 15000],
    ["डेढ हजार", 150000],
    ["ढाई सौ", 25000],
    ["सवा सौ", 12500],
    ["साढ़े तीन सौ", 35000],
    ["साढे तीन सौ", 35000],
    ["पौने दो सौ", 17500],
    // with हज़ार (user-requested)
    ["ढाई हज़ार", 250000],
    ["डेढ़ हज़ार", 150000],
    ["साढ़े तीन हज़ार", 350000],
    ["पौने दो हज़ार", 175000],
  ])("%j → %i", (input, paise) => expectPaise(input, paise));
});

describe("romanized Hindi, confirmed for M11 (the EN mic and typing)", () => {
  it.each([
    ["paanch sau", 50000],
    ["dhai hazaar", 250000],
    ["dedh sau", 15000],
    ["sava sau", 12500],
  ])("%j → %i", (input, paise) => expectPaise(input, paise));
});

describe("Devanagari currency words, digits and mixes (M11)", () => {
  it.each([
    ["पाँच सौ रुपये", 50000],
    ["पांच सौ रुपए", 50000],
    ["एक रुपया", 100],
    ["५०० रुपये", 50000],
    ["₹ पाँच सौ", 50000],
    ["5 सौ", 50000],
    ["२ हज़ार", 200000],
  ])("%j → %i", (input, paise) => expectPaise(input, paise));
});

describe('Devanagari: a trailing "दो" is the verb "give", like "do"', () => {
  it.each([
    ["पाँच सौ दो", 50000],
    ["दो सौ दो", 20000],
    ["५०० दो", 50000],
    ["दो", 200], // alone it is the number 2
  ])("%j → %i", (input, paise) => expectPaise(input, paise));
});

describe("Devanagari failures (ok: false)", () => {
  it.each([
    ["कुछ पैसे"], // "some money"
    ["बहुत सारे"], // "a lot"
    ["पाँच सौ या छह सौ"], // two amounts
    ["सौ सौ"],
    // Unknown word: parseAmount only gets the amount SPAN. A full sentence ("मम्मी को पाँच सौ भेजो")
    // works because the AI copies only "पाँच सौ" (see app.test.ts and turn.test.ts).
    ["पाँच सौ भेजो"],
    ["हज़ार लाख"], // groups must get smaller
    ["साढ़े"], // incomplete prefix
    ["शून्य"], // zero is not a payment
  ])("%j", (input) => expectFail(input));
});
