import { crossScriptKey, matchPayees, normalizeName } from "../match";
import type { Payee } from "../payees";
import { MUMMY, PAPA, PAYEES, PRIYA, RAHUL_SHARMA, RAHUL_VERMA } from "./fixtures";

// A fake payee with just a name (and maybe aliases), for the M11 cross-script tests.
const named = (displayName: string, aliases: string[] = []): Payee => ({
  ...PRIYA,
  id: `p-${displayName}`,
  displayName,
  vpa: `${displayName.length}x.fake@upi`,
  aliases,
});

describe("normalizeName", () => {
  it.each([
    ["  Mummy  ", "mummy"],
    ["Rahul  Kumar", "rahul kumar"],
    ["Rahul.", "rahul"],
    ["", ""],
    // relationship spellings → one canonical word
    ["Mumma", "mummy"],
    ["mumy", "mummy"],
    ["Mom", "mummy"],
    ["maa", "mummy"],
    ["मम्मी", "mummy"],
    ["pappa", "papa"],
    ["Dad", "papa"],
    ["पापा", "papa"],
    // trailing honorifics are dropped
    ["Papa ji", "papa"],
    ["Mummy jee", "mummy"],
    ["मम्मी जी", "mummy"],
    ["Rahul Bhaiya", "rahul"],
    ["Priya didi", "priya"],
    ["Sharma ji", "sharma"],
    // ...but never the whole name
    ["Bhaiya", "bhaiya"],
    ["Didi", "didi"],
  ])("%j → %j", (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });
});

describe("matchPayees", () => {
  it.each([
    ["Mummy", MUMMY],
    ["mumma ji", MUMMY],
    ["Maa", MUMMY],
    ["मम्मी", MUMMY],
    ["Papa", PAPA],
    ["Dad", PAPA],
    ["पापा", PAPA],
    ["Priya", PRIYA],
    ["Priya didi", PRIYA],
    ["Rahul Sharma", RAHUL_SHARMA],
    ["rahul verma", RAHUL_VERMA],
  ])("%j → one payee", (spoken, payee) => {
    expect(matchPayees(spoken, PAYEES)).toEqual({ kind: "one", payee });
  });

  it('"Rahul" matches both Rahuls → many (in saved order)', () => {
    expect(matchPayees("Rahul", PAYEES)).toEqual({
      kind: "many",
      payees: [RAHUL_SHARMA, RAHUL_VERMA],
    });
  });

  it('"Rahul bhaiya" is still ambiguous: the honorific does not pick a Rahul', () => {
    expect(matchPayees("Rahul bhaiya", PAYEES).kind).toBe("many");
  });

  it("two payees both called Mummy → many", () => {
    const sasural = { ...MUMMY, id: "p-mummy-2", displayName: "Mummy (Sasural)", vpa: "m2.fake@upi" };
    expect(matchPayees("Mummy", [MUMMY, sasural])).toEqual({
      kind: "many",
      payees: [MUMMY, sasural],
    });
  });

  it("a payee matched through several aliases appears once", () => {
    const result = matchPayees("Mummy", [{ ...MUMMY, aliases: ["mummy", "mumma", "mom"] }]);
    expect(result.kind).toBe("one");
  });

  it.each([["Chacha"], [""], ["   "], ["Rahu"], ["Sharma"]])("%j → none", (spoken) => {
    expect(matchPayees(spoken, PAYEES)).toEqual({ kind: "none" });
  });

  it("no payees saved → none", () => {
    expect(matchPayees("Mummy", [])).toEqual({ kind: "none" });
  });
});

// M11: more relationship words, in both scripts.
describe("normalizeName: relationship words (M11)", () => {
  it.each([
    ["भैया", "bhaiya"],
    ["bhaiyya", "bhaiya"],
    ["दीदी", "didi"],
    ["नानी", "nani"],
    ["नाना", "nana"],
    ["दादी", "dadi"],
    ["दादा", "dada"],
    ["चाचा", "chacha"],
    ["चाची", "chachi"],
    ["भाभी", "bhabhi"],
    ["Nani ji", "nani"],
    ["नानी जी", "nani"],
    // user-requested additions
    ["मामा", "mama"], // Devanagari only: the Latin "Mama" is left alone (it can mean mom in English)
    ["मामी", "mami"],
    ["मौसी", "mausi"],
    ["mosi", "mausi"],
    ["मौसा", "mausa"],
    ["mosa", "mausa"],
    ["बुआ", "bua"],
    ["फूफा", "phupha"],
    ["fufa", "phupha"],
  ])("%j → %j", (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });

  it('"Mama" in Latin script is not mapped to anything (not to mummy, not to the uncle)', () => {
    expect(normalizeName("Mama")).toBe("mama");
    expect(matchPayees("Mama", PAYEES)).toEqual({ kind: "none" });
  });

  it.each([
    ["नानी", named("Nani")],
    ["दादी", named("Dadi")],
    ["चाचा", named("Chacha")],
    ["भाभी", named("Bhabhi")],
    ["भैया", named("Ravi", ["bhaiya"])],
    ["दीदी", named("Pooja", ["didi"])],
    ["मामा", named("Mama")],
    ["मौसी", named("Mausi")],
    ["बुआ", named("Bua")],
    ["फूफा", named("Suresh", ["fufa"])],
  ])("%j finds the payee saved in Latin script", (spoken, payee) => {
    expect(matchPayees(spoken, [MUMMY, payee])).toEqual({ kind: "one", payee });
  });
});

// M11: a Devanagari name (हिं mic) can match a payee saved in Latin script, and the other way round,
// by a loose spelling key. Used only when the normal match finds nobody; more than one → "Which X?".
describe("crossScriptKey: the same name in both scripts gives the same key", () => {
  it.each([
    ["राहुल", "Rahul"],
    ["प्रिया", "Priya"],
    ["अमित", "Amit"],
    ["सुनीता", "Sunita"],
    ["विकास", "Vikas"],
    ["विकास", "Wikas"],
    ["पूजा", "Pooja"],
    ["पूजा", "Puja"],
    ["दीपक", "Deepak"],
    ["रोहित", "Rohit"],
    ["नेहा", "Neha"],
    ["रचना", "Rachna"],
    ["संजय", "Sanjay"],
    ["राहुल शर्मा", "Rahul Sharma"],
  ])("%j ≈ %j", (devanagari, latin) => {
    expect(crossScriptKey(devanagari)).toBe(crossScriptKey(latin));
  });

  it.each([
    ["राहुल", "Rohit"],
    ["सुनील", "Sunita"],
    ["रवि", "Ravina"],
    ["अमित", "Ankit"],
    ["पूजा", "Priya"],
  ])("%j ≠ %j", (devanagari, latin) => {
    expect(crossScriptKey(devanagari)).not.toBe(crossScriptKey(latin));
  });
});

describe("matchPayees across scripts (M11)", () => {
  it('"प्रिया" → the payee saved as "Priya"', () => {
    expect(matchPayees("प्रिया", PAYEES)).toEqual({ kind: "one", payee: PRIYA });
  });

  it('"Rahul" (typed) → the payee saved as "राहुल"', () => {
    const rahul = named("राहुल");
    expect(matchPayees("Rahul", [MUMMY, rahul])).toEqual({ kind: "one", payee: rahul });
  });

  it('"राहुल" → both Rahuls (first-name match) → many: the user picks', () => {
    expect(matchPayees("राहुल", PAYEES)).toEqual({ kind: "many", payees: [RAHUL_SHARMA, RAHUL_VERMA] });
  });

  it('"राहुल शर्मा" → only Rahul Sharma', () => {
    expect(matchPayees("राहुल शर्मा", PAYEES)).toEqual({ kind: "one", payee: RAHUL_SHARMA });
  });

  it("two payees with the same loose key → many, never a guess", () => {
    const amit = named("Amit");
    const amita = named("Amita");
    expect(matchPayees("अमित", [amit, amita])).toEqual({ kind: "many", payees: [amit, amita] });
  });

  // User's rule: an exact match is never picked when a cross-script match finds a different payee.
  it('an English "Rahul" and a different "राहुल" are both saved → "Rahul" asks "Which Rahul?"', () => {
    const rahulLatin = named("Rahul");
    const rahulHindi = named("राहुल");
    expect(matchPayees("Rahul", [rahulLatin, rahulHindi])).toEqual({ kind: "many", payees: [rahulLatin, rahulHindi] });
  });

  it('… and "राहुल" asks "Which Rahul?" too', () => {
    const rahulLatin = named("Rahul");
    const rahulHindi = named("राहुल");
    expect(matchPayees("राहुल", [rahulLatin, rahulHindi])).toEqual({ kind: "many", payees: [rahulLatin, rahulHindi] });
  });

  it("the same payee found both ways (name + an alias in the other script) is still one", () => {
    const sunita = named("Sunita", ["सुनीता"]);
    expect(matchPayees("Sunita", [sunita])).toEqual({ kind: "one", payee: sunita });
    expect(matchPayees("सुनीता", [sunita])).toEqual({ kind: "one", payee: sunita });
  });

  it("an exact match with no cross-script lookalike is picked as before", () => {
    expect(matchPayees("Priya", [named("Priya"), named("राहुल")]).kind).toBe("one");
  });

  it.each([
    ["रोहित", [named("Rahul")]],
    ["शर्मा", [RAHUL_SHARMA]], // a surname alone still doesn't match
    ["रवि", [named("Ravina")]],
    ["राहु", [named("Rahul")]],
  ])("%j → none", (spoken, payees) => {
    expect(matchPayees(spoken, payees)).toEqual({ kind: "none" });
  });

  it("aliases are matched across scripts too", () => {
    const mom = named("Sunita", ["सुनीता"]);
    expect(matchPayees("Sunita", [mom]).kind).toBe("one");
    expect(matchPayees("सुनीता", [named("Sunita")]).kind).toBe("one");
  });
});
