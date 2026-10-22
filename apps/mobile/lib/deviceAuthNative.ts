// The phone side of deviceAuth.ts: Android's own fingerprint / PIN prompt (expo-local-authentication).
import { SecurityLevel, authenticateAsync, getEnrolledLevelAsync } from "expo-local-authentication";

import { createDeviceAuth } from "./deviceAuth";
import { strings } from "./strings";

export const deviceAuth = createDeviceAuth({
  async securityLevel() {
    const level = await getEnrolledLevelAsync();
    if (level === SecurityLevel.NONE) return "none";
    return level === SecurityLevel.SECRET ? "secret" : "biometric";
  },
  authenticate: (promptMessage) =>
    authenticateAsync({
      promptMessage,
      cancelLabel: strings.common.cancel,
      disableDeviceFallback: false, // the phone's PIN/pattern works as well as a fingerprint
    }),
});
