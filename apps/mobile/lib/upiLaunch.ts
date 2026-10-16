// Opens the UPI app (PhonePe) with the payment prefilled; the user enters their PIN there.
// expo-intent-launcher only targets a package together with a className, so this is an implicit
// VIEW intent: Android opens the default UPI app or shows a chooser (pick PhonePe).
import { startActivityAsync, type IntentLauncherResult } from "expo-intent-launcher";

import type { Launcher } from "./pay";
import { buildUpiUri, statusFromLaunchResult } from "./upi";

const NOTE = "FlowPay";

// DEV switch for the M0.5 matrix (with / without tr). In-memory: resets to "on" on reload.
let includeTxnRef = true;
export const getIncludeTxnRef = () => includeTxnRef;
export const setIncludeTxnRef = (value: boolean) => {
  includeTxnRef = value;
};

// DEV: the last raw result, shown in Settings (only in __DEV__). Never logged.
export type LaunchDebug = { at: number; txnRef: string; includeTr: boolean; result?: IntentLauncherResult; error?: string };
let lastLaunch: LaunchDebug | null = null;
export const getLastLaunch = () => lastLaunch;

export const upiLauncher: Launcher = async ({ payee, amountPaise, txnRef }) => {
  const uri = buildUpiUri({
    vpa: payee.vpa,
    name: payee.displayName,
    amountPaise,
    note: NOTE,
    txnRef: includeTxnRef ? txnRef : undefined,
  });
  try {
    const result = await startActivityAsync("android.intent.action.VIEW", { data: uri });
    lastLaunch = { at: Date.now(), txnRef, includeTr: includeTxnRef, result };
    return statusFromLaunchResult(result, txnRef);
  } catch (e) {
    // The UPI app never opened (none installed / launch refused): no money moved.
    const code = e instanceof Error ? ((e as { code?: string }).code ?? e.name) : "unknown";
    lastLaunch = { at: Date.now(), txnRef, includeTr: includeTxnRef, error: String(code) };
    throw e;
  }
};
