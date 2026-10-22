// The pre-filter (M13, docs/AGENT.md): text with a UPI ID or an Indian mobile number never goes to the
// server; the phone answers by itself. A pasted UPI ID gets fixed facts (saved or not, since when,
// format, handle) and never a safety verdict: only PhonePe's bank-registered name can tell the owner.
// Pure.
import { formatIstDate } from "./format";
import type { Payee } from "./payees";
import { VPA_PATTERN } from "./upi";

export type Screened = { kind: "ok" } | { kind: "upiId"; vpa: string } | { kind: "phone" };

// Anything with text on both sides of an "@" (a UPI ID, or an email: either way not for the server).
const AT_TOKEN = /[^\s@(),;:"'<>[\]{}]+@[^\s@(),;:"'<>[\]{}]+/;
// A 10-digit Indian mobile (6–9 first), maybe with +91 / 91 / 0 in front and spaces or dashes inside.
// Not part of a longer number: no digit right before or after.
const PHONE = /(^|\D)(?:\+?91[\s-]?|0)?[6-9](?:[\s-]?\d){9}(?!\d)/;

const latinDigits = (text: string) => text.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966));

export function screenText(text: string): Screened {
  const at = AT_TOKEN.exec(text);
  if (at) return { kind: "upiId", vpa: at[0].toLowerCase().replace(/[.,!?।]+$/, "") };
  if (PHONE.test(latinDigits(text))) return { kind: "phone" };
  return { kind: "ok" };
}

// Common UPI handles. Unfamiliar is a fact, not a warning.
const KNOWN_HANDLES = new Set([
  "ybl", "ibl", "axl", "okaxis", "okhdfcbank", "okicici", "oksbi", "paytm", "ptyes", "ptaxis", "pthdfc", "ptsbi",
  "upi", "apl", "yapl", "rapl", "axisbank", "icici", "sbi", "hdfcbank", "kotak", "axisb", "ikwik", "jupiteraxis",
  "fam", "slc", "superyes", "naviaxis", "freecharge", "airtel", "jio", "waicici", "waaxis", "wahdfcbank", "wasbi",
]);

export type UpiIdFacts = {
  vpa: string;
  formatOk: boolean;
  handle: string | null;
  handleKnown: boolean;
  saved: { payeeId: string; displayName: string; addedAt: number; vpaChangedAt: number } | null;
};

export function upiIdFacts(raw: string, payees: Payee[]): UpiIdFacts {
  const vpa = raw.trim().toLowerCase();
  const formatOk = VPA_PATTERN.test(vpa);
  const at = vpa.lastIndexOf("@");
  const handle = at > 0 && at < vpa.length - 1 ? vpa.slice(at + 1) : null;
  const payee = formatOk ? payees.find((p) => p.vpa.toLowerCase() === vpa) : undefined;
  return {
    vpa,
    formatOk,
    handle,
    handleKnown: !!handle && KNOWN_HANDLES.has(handle),
    saved: payee
      ? { payeeId: payee.id, displayName: payee.displayName, addedAt: payee.addedAt, vpaChangedAt: payee.vpaChangedAt }
      : null,
  };
}

export const UPI_OWNER_NOTE = "Only PhonePe's bank-registered name can confirm the owner.";

// The lines on the check screen: facts only, the owner note always last.
export function upiFactLines(f: UpiIdFacts): string[] {
  const lines: string[] = [];
  if (f.saved) {
    lines.push(`Saved as ${f.saved.displayName} since ${formatIstDate(f.saved.addedAt)}.`);
    if (f.saved.vpaChangedAt > f.saved.addedAt) lines.push(`This UPI ID was set on ${formatIstDate(f.saved.vpaChangedAt)}.`);
  } else {
    lines.push("Not one of your saved payees. To pay it, add it in Settings first.");
  }
  if (!f.formatOk) lines.push("This doesn't look like a UPI ID (name@handle).");
  else if (f.handleKnown) lines.push(`@${f.handle} is a common UPI handle.`);
  else lines.push(`@${f.handle} is not a handle FlowPay knows.`);
  lines.push(UPI_OWNER_NOTE);
  return lines;
}
