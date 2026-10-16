// Sending a payment: a "pending" history entry is written BEFORE the UPI app opens, then updated
// from the result. If the app is killed while PhonePe is open, the pending entry survives and is
// resolved on the next start ("Did the payment go through?").
import type { PaymentStatus } from "./history";
import type { Payee } from "./payees";
import { historyStore } from "./stores";

export type LaunchResult = Exclude<PaymentStatus, "pending">;
export type Launcher = (p: { payee: Payee; amountPaise: number; txnRef: string }) => Promise<LaunchResult>;

// True while this app session is waiting for PhonePe, so the recovery check doesn't ask about it.
let inFlight: string | null = null;
export const paymentInFlight = () => inFlight;

export type SendOutcome = { status: LaunchResult; launchFailed: boolean };

export async function sendPayment(
  p: { payee: Payee; amountPaise: number; txnRef: string; now: number },
  launch: Launcher,
): Promise<SendOutcome> {
  const added = await historyStore.add({
    txnRef: p.txnRef,
    payeeId: p.payee.id,
    payeeName: p.payee.displayName,
    amountPaise: p.amountPaise,
    status: "pending",
    createdAt: p.now,
  });
  if (!added.ok) throw new Error(`history: ${added.error}`);

  inFlight = p.txnRef;
  let outcome: SendOutcome;
  try {
    outcome = { status: await launch({ payee: p.payee, amountPaise: p.amountPaise, txnRef: p.txnRef }), launchFailed: false };
  } catch {
    outcome = { status: "failed", launchFailed: true }; // the UPI app never opened, so no money moved
  } finally {
    inFlight = null;
  }
  await historyStore.updateStatus(p.txnRef, outcome.status);
  return outcome;
}
