import { matchPayees, normalizeName } from "../match";
import { MUMMY, PAPA, PAYEES, PRIYA, RAHUL_SHARMA, RAHUL_VERMA } from "./fixtures";

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
