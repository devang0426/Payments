// Add a payee by scanning their UPI QR (Settings → Add payee → Scan QR). The QR only FILLS the form:
// the payee is saved like any other (fingerprint/PIN, 24 h new-payee limit), and a QR never pays.
// What the QR says is untrusted (its owner wrote it): only the UPI ID is used, the name is a
// suggestion she/you can edit, and any amount, note or reference in it is ignored.
import { parseUpiQr } from "../upi";

describe("parseUpiQr: a UPI QR → UPI ID + suggested name", () => {
  it("a typical sticker: upi://pay?pa=…&pn=…", () => {
    expect(parseUpiQr("upi://pay?pa=ramesh.fake@upi&pn=Ramesh%20Doodhwala")).toEqual({
      ok: true,
      vpa: "ramesh.fake@upi",
      name: "Ramesh Doodhwala",
      merchant: false,
    });
  });

  it("upper case scheme and keys, extra spaces around the text", () => {
    expect(parseUpiQr("  UPI://PAY?PA=ramesh.fake@upi&PN=Ramesh  ")).toEqual({ ok: true, vpa: "ramesh.fake@upi", name: "Ramesh", merchant: false });
  });

  it("the UPI ID is decoded, trimmed and lower-cased (%40 = @)", () => {
    expect(parseUpiQr("upi://pay?pa=%20Ramesh.Fake%40UPI%20")).toMatchObject({ ok: true, vpa: "ramesh.fake@upi" });
  });

  it('"+" in the name is a space; Devanagari names are kept', () => {
    expect(parseUpiQr("upi://pay?pa=ramesh.fake@upi&pn=Ramesh+Kumar")).toMatchObject({ name: "Ramesh Kumar" });
    expect(parseUpiQr(`upi://pay?pa=ramesh.fake@upi&pn=${encodeURIComponent("रमेश दूधवाला")}`)).toMatchObject({ name: "रमेश दूधवाला" });
  });

  it("an amount, note or reference in the QR is IGNORED (the amount always comes from her words)", () => {
    const result = parseUpiQr("upi://pay?pa=shop.fake@upi&pn=Shop&am=5000.00&cu=INR&tn=Pay%20now&tr=ABC123");
    expect(result).toEqual({ ok: true, vpa: "shop.fake@upi", name: "Shop", merchant: false });
    expect(JSON.stringify(result)).not.toMatch(/5000|ABC123|Pay now/);
  });

  it("a shop QR (merchant code) is marked as such; 0000 is a person", () => {
    expect(parseUpiQr("upi://pay?pa=shop.fake@upi&pn=Shop&mc=5411")).toMatchObject({ merchant: true });
    expect(parseUpiQr("upi://pay?pa=ramesh.fake@upi&pn=Ramesh&mc=0000")).toMatchObject({ merchant: false });
  });

  it("the name: missing or blank → none; control characters removed; spaces collapsed; at most 50", () => {
    expect(parseUpiQr("upi://pay?pa=ramesh.fake@upi")).toEqual({ ok: true, vpa: "ramesh.fake@upi", merchant: false });
    expect(parseUpiQr("upi://pay?pa=ramesh.fake@upi&pn=%20%20")).toEqual({ ok: true, vpa: "ramesh.fake@upi", merchant: false });
    expect(parseUpiQr("upi://pay?pa=ramesh.fake@upi&pn=Ram%0Aesh%09%20%20Kumar")).toMatchObject({ name: "Ram esh Kumar" });
    const long = parseUpiQr(`upi://pay?pa=ramesh.fake@upi&pn=${"A".repeat(80)}`);
    expect(long.ok && long.name).toBe("A".repeat(50));
  });

  it("a QR with only a UPI ID in it (no link) → that UPI ID", () => {
    expect(parseUpiQr("ramesh.fake@upi")).toEqual({ ok: true, vpa: "ramesh.fake@upi", merchant: false });
  });

  it.each([
    ["a web link", "https://example.com/pay?pa=ramesh.fake@upi"],
    ["plain text", "hello"],
    ["empty", ""],
    ["a bank (EMV / Bharat QR) code", "00020101021226300014A000000524"],
    ["a UPI autopay mandate (not a one-time payee)", "upi://mandate?pa=ramesh.fake@upi&pn=Ramesh"],
    ["far too long", `upi://pay?pa=ramesh.fake@upi&pn=${"x".repeat(1200)}`],
  ])("not a UPI pay QR: %s → notUpi", (_label, text) => {
    expect(parseUpiQr(text)).toEqual({ ok: false, reason: "notUpi" });
  });

  it("no UPI ID in it → noVpa", () => {
    expect(parseUpiQr("upi://pay?pn=Ramesh&am=100")).toEqual({ ok: false, reason: "noVpa" });
    expect(parseUpiQr("upi://pay?pa=&pn=Ramesh")).toEqual({ ok: false, reason: "noVpa" });
  });

  it.each([["abc"], ["a@1bank"], ["x@y@z"], ["ramesh fake@upi"]])("an invalid UPI ID %j → badVpa", (pa) => {
    expect(parseUpiQr(`upi://pay?pa=${encodeURIComponent(pa)}`)).toEqual({ ok: false, reason: "badVpa" });
  });

  it("two different UPI IDs in one QR → refused (which one would we save?)", () => {
    expect(parseUpiQr("upi://pay?pa=ramesh.fake@upi&pa=other.fake@upi")).toEqual({ ok: false, reason: "multiple" });
  });

  it("broken %-encoding never throws", () => {
    expect(() => parseUpiQr("upi://pay?pa=ramesh.fake@upi&pn=%E0%A4")).not.toThrow();
    expect(parseUpiQr("upi://pay?pa=ramesh.fake@upi&pn=%E0%A4")).toMatchObject({ ok: true, vpa: "ramesh.fake@upi" });
  });
});
