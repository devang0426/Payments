import {
  buildUpiUri,
  extractUpiResponse,
  formatRupeesForUri,
  makeTxnRef,
  parseUpiResponse,
  statusFromLaunchResult,
} from "../upi";

const base = { vpa: "mummy.fake@upi", name: "Mummy Ji", amountPaise: 50000, note: "FlowPay" };

describe("formatRupeesForUri (integer paise → 2-decimal string, no floats)", () => {
  it.each([
    [1, "0.01"],
    [5, "0.05"],
    [50, "0.50"],
    [100, "1.00"],
    [10150, "101.50"],
    [50000, "500.00"],
    [300000, "3000.00"],
    [123456789, "1234567.89"],
  ])("%i → %s", (paise, am) => {
    expect(formatRupeesForUri(paise)).toBe(am);
  });

  it.each([[0], [-1], [1.5], [Number.NaN]])("throws for %p", (paise) => {
    expect(() => formatRupeesForUri(paise)).toThrow();
  });
});

describe("buildUpiUri", () => {
  it("builds the URI with tr", () => {
    expect(buildUpiUri({ ...base, txnRef: "FP1" })).toBe(
      "upi://pay?pa=mummy.fake@upi&pn=Mummy%20Ji&am=500.00&cu=INR&tn=FlowPay&tr=FP1",
    );
  });

  it("omits tr when no txnRef is given", () => {
    expect(buildUpiUri(base)).toBe("upi://pay?pa=mummy.fake@upi&pn=Mummy%20Ji&am=500.00&cu=INR&tn=FlowPay");
  });

  it("omits tn when the note is empty", () => {
    expect(buildUpiUri({ ...base, note: "" })).toBe("upi://pay?pa=mummy.fake@upi&pn=Mummy%20Ji&am=500.00&cu=INR");
  });

  it("URL-encodes name and note but keeps @ in the UPI ID", () => {
    const uri = buildUpiUri({ ...base, name: "A&B=C", note: "rent & bills" });
    expect(uri).toContain("pa=mummy.fake@upi&");
    expect(uri).toContain("pn=A%26B%3DC&");
    expect(uri).toContain("tn=rent%20%26%20bills");
  });

  it("never adds a merchant code (mc)", () => {
    expect(buildUpiUri({ ...base, txnRef: "FP1" })).not.toMatch(/[?&]mc=/);
  });

  it.each([["not-a-vpa"], [""], ["a b@upi"]])("throws for UPI ID %j", (vpa) => {
    expect(() => buildUpiUri({ ...base, vpa })).toThrow();
  });

  it("throws for an invalid amount", () => {
    expect(() => buildUpiUri({ ...base, amountPaise: 0 })).toThrow();
  });
});

describe("parseUpiResponse", () => {
  it.each([
    ["txnId=123&responseCode=00&Status=SUCCESS&txnRef=FP1", "success"],
    ["status=success&txnRef=FP1", "success"],
    ["Status=Success", "success"],
    ["txnId=123&responseCode=ZD&Status=FAILURE&txnRef=FP1", "failed"],
    ["Status=FAILED", "failed"],
    ["Status=SUBMITTED&txnRef=FP1", "unknown"],
    ["Status=PENDING", "unknown"],
    ["responseCode=00", "unknown"], // no status → don't assume success
    ["garbage", "unknown"],
    ["", "unknown"],
  ] as const)("%j → %s", (response, status) => {
    expect(parseUpiResponse(response, "FP1")).toBe(status);
  });

  it.each([[undefined], [null]])("%p → unknown", (response) => {
    expect(parseUpiResponse(response, "FP1")).toBe("unknown");
  });

  it("a response for a different txnRef → unknown", () => {
    expect(parseUpiResponse("Status=SUCCESS&txnRef=OTHER", "FP1")).toBe("unknown");
  });

  it("txnRef comparison ignores case", () => {
    expect(parseUpiResponse("Status=SUCCESS&txnRef=fp1", "FP1")).toBe("success");
  });

  it("URL-encoded values are decoded", () => {
    expect(parseUpiResponse("Status%3DSUCCESS", "FP1")).toBe("unknown");
    expect(parseUpiResponse("Status=SUCCESS&txnRef=FP%31", "FP1")).toBe("success");
  });
});

describe("makeTxnRef", () => {
  it("is alphanumeric and at most 35 characters", () => {
    expect(makeTxnRef()).toMatch(/^[A-Za-z0-9]{1,35}$/);
  });

  it("is unique across many calls", () => {
    const refs = new Set(Array.from({ length: 1000 }, () => makeTxnRef()));
    expect(refs.size).toBe(1000);
  });
});

// What expo-intent-launcher hands back: { resultCode, data?, extra? }. UPI apps differ in where
// they put the response, so we look in the usual places.
describe("extractUpiResponse", () => {
  it("reads extra.response (the NPCI-documented key)", () => {
    expect(extractUpiResponse({ resultCode: -1, extra: { response: "Status=SUCCESS&txnRef=FP1" } })).toBe(
      "Status=SUCCESS&txnRef=FP1",
    );
  });

  it("builds a response from separate extras (Status, txnRef, ...)", () => {
    expect(
      extractUpiResponse({ resultCode: -1, extra: { Status: "SUCCESS", txnRef: "FP1", txnId: "123" } }),
    ).toBe("Status=SUCCESS&txnRef=FP1&txnId=123");
  });

  it("reads a response string from data when it looks like one", () => {
    expect(extractUpiResponse({ resultCode: -1, data: "txnId=1&Status=FAILURE&txnRef=FP1" })).toBe(
      "txnId=1&Status=FAILURE&txnRef=FP1",
    );
  });

  it.each([
    [{ resultCode: 0 }],
    [{ resultCode: -1, extra: {} }],
    [{ resultCode: -1, extra: { response: 42 } }],
    [{ resultCode: -1, data: "content://something" }],
  ])("nothing usable → undefined: %j", (result) => {
    expect(extractUpiResponse(result)).toBeUndefined();
  });
});

describe("statusFromLaunchResult", () => {
  it.each([
    [{ resultCode: -1, extra: { response: "Status=SUCCESS&txnRef=FP1" } }, "success"],
    [{ resultCode: -1, extra: { response: "Status=FAILURE&txnRef=FP1" } }, "failed"],
    [{ resultCode: 0, extra: { response: "Status=FAILURE&txnRef=FP1" } }, "failed"],
    // No clear answer → "unknown", so the app asks "Did the payment go through?"
    [{ resultCode: 0 }, "unknown"], // back pressed, or an app that returns nothing
    [{ resultCode: -1 }, "unknown"],
    [{ resultCode: -1, extra: { response: "Status=SUCCESS&txnRef=OTHER" } }, "unknown"],
  ] as const)("%j → %s", (result, status) => {
    expect(statusFromLaunchResult(result, "FP1")).toBe(status);
  });
});
