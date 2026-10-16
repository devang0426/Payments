import { normalizePhone } from "../phone";

describe("normalizePhone", () => {
  it.each([
    ["+91 90000 00001"],
    ["+919000000001"],
    ["09000000001"],
    ["9000000001"],
    ["91-9000000001"],
    ["+91-90000-00001"],
    ["(+91) 90000 00001"],
    ["0091 9000000001"],
    ["  9000000001  "],
  ])("%j → +919000000001", (raw) => {
    expect(normalizePhone(raw)).toBe("+919000000001");
  });

  it.each([
    ["6000000001", "+916000000001"],
    ["7000000001", "+917000000001"],
    ["8000000001", "+918000000001"],
  ])("Indian mobiles start with 6–9: %j", (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each([
    [""],
    ["12345"], // too short
    ["900000000"], // 9 digits
    ["900000000012"], // 12 digits without 91
    ["5000000001"], // not an Indian mobile prefix
    ["+1 415 555 0100"], // non-Indian
    ["+44 7700 900000"],
    ["90000abc01"], // letters
    ["call me"],
  ])("%j → null", (raw) => {
    expect(normalizePhone(raw)).toBeNull();
  });
});
