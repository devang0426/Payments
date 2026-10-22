// Fingerprint / phone PIN before saving, editing or deleting a payee. Only "ok" lets the change
// through; everything else (no screen lock, cancel, failure, error) blocks it.
import { createDeviceAuth, type DeviceAuthApi } from "../deviceAuth";

function fakeApi(
  level: Awaited<ReturnType<DeviceAuthApi["securityLevel"]>> | Error,
  outcome: Awaited<ReturnType<DeviceAuthApi["authenticate"]>> | Error = { success: true },
) {
  const prompts: string[] = [];
  const api: DeviceAuthApi = {
    securityLevel: async () => {
      if (level instanceof Error) throw level;
      return level;
    },
    authenticate: async (prompt) => {
      prompts.push(prompt);
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
  return { api, prompts };
}

describe("device auth before payee changes", () => {
  it("no screen lock at all → noLock, without showing a prompt", async () => {
    const { api, prompts } = fakeApi("none");
    expect(await createDeviceAuth(api).confirm("Change payee")).toBe("noLock");
    expect(prompts).toEqual([]);
  });

  it.each([["secret"], ["biometric"]] as const)("screen lock (%s) + success → ok, with our prompt", async (level) => {
    const { api, prompts } = fakeApi(level);
    expect(await createDeviceAuth(api).confirm("Change payee")).toBe("ok");
    expect(prompts).toEqual(["Change payee"]);
  });

  it.each([["user_cancel"], ["system_cancel"], ["app_cancel"]])("%s → cancelled", async (error) => {
    const { api } = fakeApi("biometric", { success: false, error });
    expect(await createDeviceAuth(api).confirm("x")).toBe("cancelled");
  });

  it.each([["passcode_not_set"], ["not_enrolled"]])("%s → noLock", async (error) => {
    const { api } = fakeApi("secret", { success: false, error });
    expect(await createDeviceAuth(api).confirm("x")).toBe("noLock");
  });

  it.each([["lockout"], ["authentication_failed"], ["timeout"], ["unknown"], ["something_new"]])(
    "%s → failed",
    async (error) => {
      const { api } = fakeApi("biometric", { success: false, error });
      expect(await createDeviceAuth(api).confirm("x")).toBe("failed");
    },
  );

  it("reading the security level throws → failed (never ok)", async () => {
    const { api, prompts } = fakeApi(new Error("native"));
    expect(await createDeviceAuth(api).confirm("x")).toBe("failed");
    expect(prompts).toEqual([]);
  });

  it("the prompt itself throws → failed (never ok)", async () => {
    const { api } = fakeApi("biometric", new Error("native"));
    expect(await createDeviceAuth(api).confirm("x")).toBe("failed");
  });
});
