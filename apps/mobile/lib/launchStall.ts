// The default StallWatcher for sendPayment: FlowPay came back to the screen after the UPI app opened,
// but no result arrived within 15 s. That happens when Android recreated FlowPay's screen while
// PhonePe was open (the result then has nowhere to go), and the payment would wait forever.
import { AppState } from "react-native";

import type { StallWatcher } from "./pay";

export const STALL_AFTER_RETURN_MS = 15_000;

export const appStallWatcher: StallWatcher = (onStall) => {
  let wasAway = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const sub = AppState.addEventListener("change", (state) => {
    if (state === "active") {
      if (wasAway && !timer) timer = setTimeout(onStall, STALL_AFTER_RETURN_MS);
      return;
    }
    wasAway = true; // the UPI app is on top
    if (timer) clearTimeout(timer);
    timer = null;
  });
  return () => {
    sub.remove();
    if (timer) clearTimeout(timer);
  };
};
