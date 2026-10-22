// Display helpers. Pure. Money arrives as integer paise; rupees exist only as display text.
import type { When } from "./reminders";

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Indian digit grouping: 1234567 → "12,34,567".
function groupIndian(n: number): string {
  const s = String(n);
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

// 50000 → "₹500", 150050 → "₹1,500.50". Paise shown only when non-zero.
export function formatRupees(amountPaise: number): string {
  const sign = amountPaise < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(amountPaise));
  const rupees = Math.floor(abs / 100);
  const paise = abs % 100;
  return `${sign}₹${groupIndian(rupees)}${paise ? `.${String(paise).padStart(2, "0")}` : ""}`;
}

// For text-to-speech (no ₹ sign, no commas): 50000 → "500 rupees", 100 → "1 rupee",
// 10150 → "101 rupees 50 paise", 50 → "50 paise".
export function spokenRupees(amountPaise: number): string {
  const rupees = Math.floor(amountPaise / 100);
  const paise = amountPaise % 100;
  const parts: string[] = [];
  if (rupees > 0) parts.push(`${rupees} ${rupees === 1 ? "rupee" : "rupees"}`);
  if (paise > 0) parts.push(`${paise} paise`);
  return parts.join(" ") || "0 rupees";
}

// "mummy.fake@upi" → "mu•••@upi"
export function maskVpa(vpa: string): string {
  const at = vpa.lastIndexOf("@");
  if (at <= 0) return "•••";
  const local = vpa.slice(0, at);
  const visible = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1);
  return `${visible}•••${vpa.slice(at)}`;
}

// "+919000000001" → "0001"
export function lastFour(phone: string | undefined): string | null {
  const digits = phone?.replace(/\D/g, "") ?? "";
  return digits.length >= 4 ? digits.slice(-4) : null;
}

const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 22nd
function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

// When a reminder rings, in English (screen and speech): "on 1 November" / "every month on the 1st".
export function formatWhen(when: When, nextAt: number): string {
  if (when.kind === "monthly") return `every month on the ${ordinal(when.day)}`;
  const d = new Date(nextAt + IST_OFFSET_MS);
  return `on ${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]}`;
}

// 15 Oct 2026 (IST, fixed +05:30)
export function formatIstDate(timestampMs: number): string {
  const d = new Date(timestampMs + IST_OFFSET_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// 15 Oct 2026, 3:05 PM (IST, fixed +05:30)
export function formatIstDateTime(timestampMs: number): string {
  const d = new Date(timestampMs + IST_OFFSET_MS);
  const h24 = d.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${h12}:${mm} ${h24 < 12 ? "AM" : "PM"}`;
}
