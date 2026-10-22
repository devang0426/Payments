// Fingerprint / phone PIN before saving, editing or deleting a payee, so whoever holds an unlocked
// phone can't quietly point "Mummy" at their own UPI ID. Only "ok" lets a change through; no screen
// lock, cancel, failure or any error blocks it. Pure: the native calls come in through `api`
// (deviceAuthNative.ts), so this logic is tested without a phone.

export type SecurityLevel = "none" | "secret" | "biometric";

export type DeviceAuthApi = {
  securityLevel(): Promise<SecurityLevel>;
  authenticate(promptMessage: string): Promise<{ success: true } | { success: false; error: string }>;
};

export type DeviceAuthResult = "ok" | "cancelled" | "noLock" | "failed";

const CANCELLED = new Set(["user_cancel", "system_cancel", "app_cancel"]);
const NO_LOCK = new Set(["passcode_not_set", "not_enrolled"]);

export function createDeviceAuth(api: DeviceAuthApi) {
  return {
    async confirm(promptMessage: string): Promise<DeviceAuthResult> {
      try {
        if ((await api.securityLevel()) === "none") return "noLock";
        const result = await api.authenticate(promptMessage);
        if (result.success) return "ok";
        if (CANCELLED.has(result.error)) return "cancelled";
        if (NO_LOCK.has(result.error)) return "noLock";
        return "failed";
      } catch {
        return "failed";
      }
    },
  };
}
