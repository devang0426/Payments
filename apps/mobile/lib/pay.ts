// Sending a payment. Right before the UPI app opens, the payee and history are read again and the
// rules re-checked: whatever changed since the Confirm card was shown (payee deleted or given a new
// UPI ID, another payment, unreadable history) blocks it, with nothing written and nothing launched.
// Then a "pending" history entry is written BEFORE the UPI app opens and updated from the result.
// If the app is killed while PhonePe is open, the pending entry survives and is resolved on the next
// start ("Did the payment go through?").
import type { PaymentStatus, createHistoryStore } from "./history";
import type { Payee, createPayeeStore } from "./payees";
import { checkPayment, type RuleFailure } from "./rules";
import { historyStore, payeeStore } from "./stores";

export type LaunchResult = Exclude<PaymentStatus, "pending">;
export type Launcher = (p: { payee: Payee; amountPaise: number; txnRef: string }) => Promise<LaunchResult>;

// True while this app session is waiting for PhonePe, so the recovery check doesn't ask about it.
let inFlight: string | null = null;
export const paymentInFlight = () => inFlight;

// PAYEE_CHANGED: the payee's UPI ID is no longer the one the Confirm card showed.
export type BlockReason = RuleFailure | "PAYEE_CHANGED";

export type SendOutcome =
  | { kind: "sent"; status: LaunchResult; launchFailed: boolean }
  | { kind: "blocked"; reason: BlockReason };

type Stores = {
  payees: Pick<ReturnType<typeof createPayeeStore>, "load">;
  history: ReturnType<typeof createHistoryStore>;
};

export async function sendPayment(
  p: { payee: Payee; amountPaise: number; txnRef: string; now: number },
  launch: Launcher,
  stores: Stores = { payees: payeeStore, history: historyStore },
): Promise<SendOutcome> {
  const [{ payees }, { entries, corrupt }] = await Promise.all([stores.payees.load(), stores.history.load()]);
  const payee = payees.find((x) => x.id === p.payee.id);
  if (!payee) return { kind: "blocked", reason: "NO_PAYEE" };
  if (payee.vpa !== p.payee.vpa) return { kind: "blocked", reason: "PAYEE_CHANGED" };
  const rule = checkPayment({
    amountPaise: p.amountPaise,
    payee,
    history: entries,
    now: p.now,
    historyUnreadable: corrupt,
  });
  if (!rule.ok) return { kind: "blocked", reason: rule.reason };

  const added = await stores.history.add({
    txnRef: p.txnRef,
    payeeId: payee.id,
    payeeName: payee.displayName,
    amountPaise: p.amountPaise,
    status: "pending",
    createdAt: p.now,
  });
  if (!added.ok) throw new Error(`history: ${added.error}`);

  inFlight = p.txnRef;
  let outcome: { status: LaunchResult; launchFailed: boolean };
  try {
    outcome = { status: await launch({ payee, amountPaise: p.amountPaise, txnRef: p.txnRef }), launchFailed: false };
  } catch {
    outcome = { status: "failed", launchFailed: true }; // the UPI app never opened, so no money moved
  } finally {
    inFlight = null;
  }
  await stores.history.updateStatus(p.txnRef, outcome.status);
  return { kind: "sent", ...outcome };
}
