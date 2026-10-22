// M13: spoken periods ("is mahine") and reminder dates ("1 tareekh") → fixed values, by code. The AI
// only copies the span; these parsers decide what it means. No clock here: the server returns a
// relative value ("this_month", "day 1 of the month") and the phone works out the dates in IST.
import { describe, expect, it } from "vitest";
import { findPeriodIn, parsePeriod, parseWhen } from "./when.js";

describe("parsePeriod (show_spending)", () => {
  it.each([
    ["aaj", "today"],
    ["aj", "today"],
    ["today", "today"],
    ["आज", "today"],
    ["kal", "yesterday"], // "kal kitna bheja" is past tense: yesterday
    ["yesterday", "yesterday"],
    ["कल", "yesterday"],
    ["is hafte", "this_week"],
    ["iss hafte", "this_week"],
    ["this week", "this_week"],
    ["इस हफ्ते", "this_week"],
    ["इस हफ़्ते", "this_week"], // nukta variant
    ["is mahine", "this_month"],
    ["iss mahine", "this_month"],
    ["this month", "this_month"],
    ["इस महीने", "this_month"],
    ["pichhle mahine", "last_month"],
    ["pichle mahine", "last_month"],
    ["pichhla mahina", "last_month"],
    ["last month", "last_month"],
    ["पिछले महीने", "last_month"],
  ])("%j → %s", (text, period) => {
    expect(parsePeriod(text)).toBe(period);
  });

  it.each([
    ["Is Mahine", "this_month"],
    ["  is   mahine  ", "this_month"],
    ["is mahine mein", "this_month"],
    ["is mahine me", "this_month"],
    ["इस महीने में", "this_month"],
    ["aaj?", "today"],
  ])("case, spaces, a trailing \"mein\" and punctuation don't matter: %j → %s", (text, period) => {
    expect(parsePeriod(text)).toBe(period);
  });

  it.each([
    [""],
    ["pichhle saal"], // last year: not supported
    ["agle mahine"], // next month: no spending in the future
    ["parson"],
    ["is mahine aur pichhle mahine"],
    ["mahine"],
    ["kal se"],
    ["3 din"],
    ["bahut pehle"],
  ])("anything else → null (the app says it didn't understand): %j", (text) => {
    expect(parsePeriod(text)).toBeNull();
  });
});

describe("parseWhen (create_reminder)", () => {
  it.each([
    ["kal", { kind: "inDays", days: 1 }], // "kal yaad dilana" is future: tomorrow
    ["tomorrow", { kind: "inDays", days: 1 }],
    ["कल", { kind: "inDays", days: 1 }],
    ["parson", { kind: "inDays", days: 2 }],
    ["parso", { kind: "inDays", days: 2 }],
    ["day after tomorrow", { kind: "inDays", days: 2 }],
    ["परसों", { kind: "inDays", days: 2 }],
  ])("%j → %j", (text, when) => {
    expect(parseWhen(text)).toEqual(when);
  });

  it.each([
    ["1 tareekh", 1],
    ["1 tareekh ko", 1],
    ["1 tarikh", 1],
    ["15 tarik ko", 15],
    ["1st", 1],
    ["2nd ko", 2],
    ["23rd", 23],
    ["31 tareekh", 31],
    ["pehli tareekh", 1],
    ["pehli tareekh ko", 1],
    ["1 तारीख", 1],
    ["१ तारीख को", 1],
    ["पहली तारीख", 1],
    ["15 तारीख़", 15],
  ])("a day of the month, once: %j → day %i", (text, day) => {
    expect(parseWhen(text)).toEqual({ kind: "dayOfMonth", day });
  });

  it.each([
    ["har mahine 1 ko", 1],
    ["har mahine 1 tareekh ko", 1],
    ["har mahine ki 5 tareekh", 5],
    ["har mahine pehli tareekh", 1],
    ["every month on the 1st", 1],
    ["every month on 10th", 10],
    ["हर महीने 1 को", 1],
    ["हर महीने की १ तारीख", 1],
    ["हर महीने 28 तारीख को", 28],
  ])("every month: %j → day %i", (text, day) => {
    expect(parseWhen(text)).toEqual({ kind: "monthly", day });
  });

  it.each([
    ["0 tareekh"],
    ["32 tareekh"],
    ["har mahine 29 ko"], // not every month has a 29th, 30th or 31st: only 1–28 repeat
    ["har mahine 31 tareekh"],
    ["har mahine"],
    ["1 ko"], // a bare "1 ko" could be anything
    ["5"],
    ["agle hafte"],
    ["2 baje"],
    ["jaldi"],
    ["kal subah 9 baje"], // times of day aren't supported: reminders ring at 9 AM
    ["1.5 tareekh"],
    ["ek tareekh"], // only digits and "pehli"
    [""],
  ])("anything else → null: %j", (text) => {
    expect(parseWhen(text)).toBeNull();
  });

  it("case, spaces and punctuation don't matter", () => {
    expect(parseWhen("  Har Mahine  1 Tareekh Ko. ")).toEqual({ kind: "monthly", day: 1 });
  });
});

// When the AI copies the period in the wrong script ("aaj" → "आज"), code reads the period straight
// from the user's own message instead. Exactly one period in the message, or nothing.
describe("findPeriodIn (the user's own words)", () => {
  it.each([
    ["aaj kitna bheja?", "today"],
    ["Papa ko is mahine kitna bheja", "this_month"],
    ["इस महीने पापा को कितना भेजा?", "this_month"],
    ["pichhle mahine mummy ko kitna gaya", "last_month"],
    ["kal kitna bheja", "yesterday"],
    ["Is Hafte kitna?", "this_week"],
  ])("%j → %s", (text, period) => {
    expect(findPeriodIn(text)).toBe(period);
  });

  it.each([
    ["Papa ko kitna bheja?"], // no period
    ["aaj aur kal kitna bheja"], // two different periods
    ["kalpana ko kitna bheja"], // "kal" inside a word doesn't count
    ["is mahine aur pichhle mahine"],
  ])("%j → null", (text) => {
    expect(findPeriodIn(text)).toBeNull();
  });

  it("the same period said twice is still one period", () => {
    expect(findPeriodIn("aaj, haan aaj kitna bheja")).toBe("today");
  });
});
