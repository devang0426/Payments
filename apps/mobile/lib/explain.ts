// M15 "Kyun block hua?": the phone explains its LAST outcome with its own numbers (rules.ts, history).
// Pure. The record is kept in memory for 10 minutes and holds no transcript, only what the phone
// decided (a reason, amounts from code, the saved name, and the name she said when it differs).
import type { PaymentStatus } from "./history";
import type { BlockReason } from "./pay";
import { NEW_PAYEE_LIMIT_PAISE, PER_PAYMENT_LIMIT_PAISE } from "./rules";

export const OUTCOME_TTL_MS = 10 * 60 * 1000;

export type Outcome =
  | {
      kind: "blocked";
      reason: BlockReason;
      payeeName: string;
      amountPaise: number;
      sentTodayPaise: number;
      leftTodayPaise: number;
      newPayeeHours?: number;
      spokenName?: string; // what she said, when it reached this payee through another name
    }
  | { kind: "noPayee"; name: string }
  | { kind: "relative" }
  | { kind: "screened" } // a UPI ID or phone number: never sent
  | { kind: "failed" } // server / internet
  | { kind: "paid"; status: PaymentStatus; payeeName: string; amountPaise: number; launchFailed: boolean };

// The words, per language (English: strings.ts, spoken English + Hindi: speech.ts). Amounts come in
// already formatted, so the screen says "₹4,000" and the voice "4000 rupees".
export type ExplainTexts = {
  nothing: string;
  perPayment: (amount: string, name: string, max: string) => string;
  daily: (amount: string, name: string, sent: string, left: string) => string;
  newPayee: (amount: string, name: string, hours: number, max: string) => string;
  notSaved: (name: string) => string;
  payeeChanged: (name: string) => string;
  historyUnreadable: string;
  invalidAmount: string;
  relative: string;
  screened: string;
  failed: string;
  paid: (amount: string, name: string) => string;
  notPaid: (amount: string, name: string) => string;
  noUpiApp: string;
  unsure: (amount: string, name: string) => string;
  saidAs: (spoken: string, name: string) => string;
};

export function explainOutcome(o: Outcome | null, t: ExplainTexts, money: (paise: number) => string): string {
  if (!o) return t.nothing;
  switch (o.kind) {
    case "noPayee":
      return t.notSaved(o.name);
    case "relative":
      return t.relative;
    case "screened":
      return t.screened;
    case "failed":
      return t.failed;
    case "paid":
      if (o.status === "success") return t.paid(money(o.amountPaise), o.payeeName);
      if (o.status === "failed") return o.launchFailed ? t.noUpiApp : t.notPaid(money(o.amountPaise), o.payeeName);
      return t.unsure(money(o.amountPaise), o.payeeName);
    case "blocked": {
      const amount = money(o.amountPaise);
      const line =
        o.reason === "OVER_PER_PAYMENT"
          ? t.perPayment(amount, o.payeeName, money(PER_PAYMENT_LIMIT_PAISE))
          : o.reason === "OVER_DAILY"
            ? t.daily(amount, o.payeeName, money(o.sentTodayPaise), money(o.leftTodayPaise))
            : o.reason === "NEW_PAYEE_LIMIT"
              ? t.newPayee(amount, o.payeeName, o.newPayeeHours ?? 24, money(NEW_PAYEE_LIMIT_PAISE))
              : o.reason === "NO_PAYEE"
                ? t.notSaved(o.payeeName)
                : o.reason === "PAYEE_CHANGED"
                  ? t.payeeChanged(o.payeeName)
                  : o.reason === "HISTORY_UNREADABLE"
                    ? t.historyUnreadable
                    : t.invalidAmount;
      const said = o.spokenName && o.spokenName.trim().toLowerCase() !== o.payeeName.trim().toLowerCase();
      return said ? `${line} ${t.saidAs(o.spokenName!, o.payeeName)}` : line;
    }
  }
}

// The record, dropped after 10 minutes.
export function createOutcomeStore(clock: () => number = Date.now) {
  let last: { outcome: Outcome; at: number } | null = null;
  return {
    set: (outcome: Outcome) => {
      last = { outcome, at: clock() };
    },
    get: (): Outcome | null => (last && clock() - last.at <= OUTCOME_TTL_MS ? last.outcome : null),
    clear: () => {
      last = null;
    },
  };
}
