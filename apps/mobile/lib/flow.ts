// What happens after the command is understood: which payee, which amount, and do the rules
// allow it. Pure.
import type { HistoryEntry } from "./history";
import { matchPayees } from "./match";
import type { Payee } from "./payees";
import { checkPayment, type RuleResult } from "./rules";

// From the server: integer paise, or "same as last time" (resolved here, from local history).
export type Amount = { kind: "paise"; paise: number } | { kind: "last" };

export type FlowResult =
  | { kind: "noPayee"; name: string }
  | { kind: "noPrevious"; payee: Payee }
  | { kind: "choose"; name: string; amount: Amount; payees: Payee[] }
  | { kind: "confirm"; payee: Payee; amountPaise: number; rule: RuleResult };

// Screen params are strings: "50000" (paise) or "last".
export function encodeAmount(amount: Amount): string {
  return amount.kind === "last" ? "last" : String(amount.paise);
}

export function decodeAmount(param: string | undefined): Amount | null {
  if (param === "last") return { kind: "last" };
  return param && /^\d{1,12}$/.test(param) ? { kind: "paise", paise: Number(param) } : null;
}

// Amount of the newest successful payment to this payee (history is newest first), or null.
export function lastPaidAmount(payeeId: string, history: HistoryEntry[]): number | null {
  const last = [...history]
    .sort((a, b) => b.createdAt - a.createdAt)
    .find((e) => e.payeeId === payeeId && e.status === "success");
  return last ? last.amountPaise : null;
}

// For one chosen payee: turn the amount into paise and run the rules.
export function confirmFor(p: {
  payee: Payee;
  amount: Amount;
  history: HistoryEntry[];
  historyUnreadable: boolean;
  now: number;
}): FlowResult {
  const amountPaise = p.amount.kind === "paise" ? p.amount.paise : lastPaidAmount(p.payee.id, p.history);
  if (amountPaise === null) return { kind: "noPrevious", payee: p.payee };
  const rule = checkPayment({
    amountPaise,
    payee: p.payee,
    history: p.history,
    now: p.now,
    historyUnreadable: p.historyUnreadable,
  });
  return { kind: "confirm", payee: p.payee, amountPaise, rule };
}

export function resolvePayment(p: {
  name: string;
  amount: Amount;
  payees: Payee[];
  history: HistoryEntry[];
  historyUnreadable: boolean;
  now: number;
}): FlowResult {
  const match = matchPayees(p.name, p.payees);
  if (match.kind === "none") return { kind: "noPayee", name: p.name };
  if (match.kind === "many") return { kind: "choose", name: p.name, amount: p.amount, payees: match.payees };
  return confirmFor({ ...p, payee: match.payee });
}
