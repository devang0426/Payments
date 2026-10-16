// App-wide store instances (SecureStore / AsyncStorage on the phone).
import { createConfirmLock } from "./confirmLock";
import { createHistoryStore } from "./history";
import { createPayeeStore } from "./payees";

export const payeeStore = createPayeeStore();
export const historyStore = createHistoryStore();
export const confirmLock = createConfirmLock();
