// UPI intent URI + PhonePe response parsing. Pure part only (launching comes in M5).
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
