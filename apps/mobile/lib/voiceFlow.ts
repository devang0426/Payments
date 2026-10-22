// The voice-first flow outside the Confirm card (M16, docs/VOICE-PLAN.md). Pure.
// Home greets and opens the mic by itself; silence or a failed request gets ONE spoken nudge and one
// more listen, then Home goes quiet and waits for a tap on the big mic. After PhonePe, the receipt
// says the result out loud.
import type { ConversationState, Question } from "./conversation";
import type { PaymentStatus } from "./history";
import type { SpeechTexts } from "./speech";

export const MAX_NUDGES = 1;

// Home's listen window: longer than the Confirm card's 5 s (older speakers pause more).
export const HOME_LISTEN_MS = 10_000;

// What Home asks when it opens: the question the conversation is waiting on, else "who?".
export function greetingQuestion(state: Pick<ConversationState, "awaiting">): Question {
  return state.awaiting === "amount" ? "amount" : "payee";
}

// misses = how many silences / failed requests in a row, counting this one.
export function afterMiss(misses: number): "nudge" | "quiet" {
  return misses <= MAX_NUDGES ? "nudge" : "quiet";
}

// What the receipt says, or null while PhonePe is still open (nothing to say yet).
export function receiptSpeech(
  t: SpeechTexts,
  p: {
    status: PaymentStatus;
    amountPaise: number;
    name: string;
    rehearsal: boolean;
    launchFailed: boolean;
    needsAnswer: boolean;
  },
): string | null {
  let line: string | null;
  if (p.needsAnswer) line = t.didItGo;
  else if (p.status === "success") line = t.paid(t.rupees(p.amountPaise), p.name);
  else if (p.status === "failed") line = p.launchFailed ? t.noUpiApp : t.notPaid;
  else line = null;
  if (line && p.rehearsal) line = `${line} ${t.rehearsalNote}`;
  return line;
}
