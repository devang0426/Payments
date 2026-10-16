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

describe("out of scope for now: Devanagari number words fail safely", () => {
  it.each([["पांच सौ"], ["दो हज़ार"]])("%j", (input) => expectFail(input));
});
