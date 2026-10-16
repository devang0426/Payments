import { isVoiceYes } from "../voiceYes";

describe("isVoiceYes (strict)", () => {
  it.each([
    ["yes"],
    ["Yes"],
    ["Yes."],
    ["yes send"],
    ["Yes, send it!"],
    ["haan"],
    ["Haan ji"],
    ["haan bhejo"],
    ["हाँ"],
    ["हां"],
    ["हाँ भेजो"],
    ["हाँ।"],
    ["  yes  "],
  ])("%j → yes", (t) => {
    expect(isVoiceYes(t)).toBe(true);
  });

  it.each([
    [""],
    ["no"],
    ["nahi"],
    ["नहीं"],
    ["yes no"],
    ["haan nahi"],
    ["yeah"], // not on the list: tap instead
    ["yes but send 1000"],
    ["send it"],
    ["ok"],
    ["haan haan"],
    ["yesterday"],
    ["send 500 rupees to mummy yes"],
  ])("%j → not a yes", (t) => {
    expect(isVoiceYes(t)).toBe(false);
  });
});
