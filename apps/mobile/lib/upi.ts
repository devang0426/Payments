// UPI intent URI + PhonePe response parsing. Pure; launching is in upiLaunch.ts.
// Money is integer paise; the "am" string is built without floats.
import type { PaymentStatus } from "./history";

export const VPA_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

// 50000 → "500.00", 1 → "0.01". Throws for anything that isn't a positive integer.
export function formatRupeesForUri(amountPaise: number): string {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw new Error("amountPaise must be a positive integer");
  }
  const rupees = Math.floor(amountPaise / 100);
  const paise = amountPaise % 100;
  return `${rupees}.${String(paise).padStart(2, "0")}`;
}

// Values are URL-encoded; "@" stays literal because some UPI apps don't decode %40 in pa.
function encode(value: string): string {
  return encodeURIComponent(value).replace(/%40/g, "@");
}

export function buildUpiUri(p: {
  vpa: string;
  name: string;
  amountPaise: number;
  note?: string;
  txnRef?: string;
}): string {
  const vpa = p.vpa.trim();
  if (!VPA_PATTERN.test(vpa)) throw new Error("Invalid UPI ID");

  // Personal payment: never a merchant code (mc).
  const params: [string, string][] = [
    ["pa", vpa],
    ["pn", p.name.trim()],
    ["am", formatRupeesForUri(p.amountPaise)],
    ["cu", "INR"],
  ];
  if (p.note?.trim()) params.push(["tn", p.note.trim()]);
  if (p.txnRef) params.push(["tr", p.txnRef]);
  return `upi://pay?${params.map(([k, v]) => `${k}=${encode(v)}`).join("&")}`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// "txnId=..&responseCode=..&Status=SUCCESS&txnRef=.." → status. Only an explicit SUCCESS for
// this payment counts as success; anything unclear is "unknown" (the user is asked).
export function parseUpiResponse(
  response: string | null | undefined,
  expectedTxnRef?: string,
): Exclude<PaymentStatus, "pending"> {
  if (!response) return "unknown";

  const fields = new Map<string, string>();
  for (const part of response.split("&")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    fields.set(safeDecode(part.slice(0, eq)).trim().toLowerCase(), safeDecode(part.slice(eq + 1)).trim());
  }

  const txnRef = fields.get("txnref");
  if (expectedTxnRef && txnRef && txnRef.toLowerCase() !== expectedTxnRef.toLowerCase()) {
    return "unknown";
  }

  const status = fields.get("status")?.toUpperCase();
  if (status === "SUCCESS") return "success";
  if (status === "FAILURE" || status === "FAILED") return "failed";
  return "unknown";
}

// The shape expo-intent-launcher resolves with (kept local so this file has no Expo imports).
export type LaunchResultLike = { resultCode: number; data?: string; extra?: unknown };

const RESPONSE_KEYS = ["Status", "status", "txnRef", "txnId", "responseCode", "ApprovalRefNo"];

// UPI apps put the response in different places: extra.response (NPCI spec), separate extras,
// or the data string. Returns undefined when there's nothing usable.
export function extractUpiResponse(result: LaunchResultLike): string | undefined {
  const extra = result.extra && typeof result.extra === "object" ? (result.extra as Record<string, unknown>) : {};
  if (typeof extra.response === "string" && extra.response.trim()) return extra.response;

  const parts = RESPONSE_KEYS.filter((k) => typeof extra[k] === "string").map((k) => `${k}=${extra[k]}`);
  if (parts.some((p) => /^status=/i.test(p))) return parts.join("&");

  if (typeof result.data === "string" && /(^|&)status=/i.test(result.data)) return result.data;
  return undefined;
}

// resultCode alone is not trusted (apps use it inconsistently); only the parsed response decides.
export function statusFromLaunchResult(
  result: LaunchResultLike,
  txnRef: string,
): Exclude<PaymentStatus, "pending"> {
  return parseUpiResponse(extractUpiResponse(result), txnRef);
}

// Alphanumeric, at most 35 characters (what UPI apps accept for tr). Unique per payment.
let lastTimestamp = 0;
let counter = 0;
export function makeTxnRef(now: number = Date.now()): string {
  counter = now === lastTimestamp ? counter + 1 : 0;
  lastTimestamp = now;
  const random = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `FP${now}${String(counter).padStart(3, "0")}${random}`;
}

// A scanned UPI QR → the UPI ID to save + a suggested name. It only fills the Add payee form: the
// payee is saved like any other (fingerprint/PIN, 24 h new-payee limit) and a QR never pays.
// Everything in a QR was written by its owner, so only `pa` is used; `pn` is a suggestion to check,
// and any amount (`am`), note (`tn`) or reference (`tr`) is ignored. Never throws.
export type QrPayee =
  | { ok: true; vpa: string; name?: string; merchant: boolean }
  | { ok: false; reason: "notUpi" | "noVpa" | "badVpa" | "multiple" };

const MAX_QR_LENGTH = 1000;
const QR_NAME_MAX = 50;

function decodeQrPart(part: string): string {
  const spaced = part.replace(/\+/g, " ");
  try {
    return decodeURIComponent(spaced);
  } catch {
    return spaced; // broken %-encoding: keep it as written
  }
}

function cleanQrName(name: string | undefined): string | undefined {
  const cleaned = (name ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, QR_NAME_MAX)
    .trim();
  return cleaned || undefined;
}

export function parseUpiQr(raw: string): QrPayee {
  const text = raw.trim();
  if (!text || text.length > MAX_QR_LENGTH) return { ok: false, reason: "notUpi" };
  if (VPA_PATTERN.test(text)) return { ok: true, vpa: text.toLowerCase(), merchant: false }; // just a UPI ID
  const link = /^upi:\/\/pay\?([\s\S]*)$/i.exec(text);
  if (!link) return { ok: false, reason: "notUpi" };

  const params = new Map<string, string[]>();
  for (const part of link[1]!.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const key = (eq < 0 ? part : part.slice(0, eq)).toLowerCase();
    params.set(key, [...(params.get(key) ?? []), eq < 0 ? "" : decodeQrPart(part.slice(eq + 1))]);
  }

  const vpas = [...new Set((params.get("pa") ?? []).map((v) => v.trim().toLowerCase()).filter(Boolean))];
  if (vpas.length === 0) return { ok: false, reason: "noVpa" };
  if (vpas.length > 1) return { ok: false, reason: "multiple" };
  const vpa = vpas[0]!;
  if (!VPA_PATTERN.test(vpa)) return { ok: false, reason: "badVpa" };

  const name = cleanQrName(params.get("pn")?.[0]);
  const mc = params.get("mc")?.[0]?.trim();
  return { ok: true, vpa, ...(name ? { name } : {}), merchant: !!mc && mc !== "0000" };
}
