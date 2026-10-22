import type { Launcher } from "../pay";
import {
  REHEARSAL_PREFIX,
  createRehearsalSetting,
  isRehearsalRef,
  launcherFor,
  rehearsalLauncher,
  txnRefFor,
} from "../rehearsal";
import { MUMMY, memoryStore } from "./fixtures";

const realLauncher: Launcher = async () => "success";

describe("rehearsal txnRefs", () => {
  it("rehearsal refs start with RH, real ones with FP; same length and alphabet", () => {
    const now = Date.parse("2026-10-16T10:00:00Z");
    const fake = txnRefFor(true, now);
    const real = txnRefFor(false, now);
    expect(fake.startsWith(REHEARSAL_PREFIX)).toBe(true);
    expect(real.startsWith("FP")).toBe(true);
    expect(fake.length).toBe(real.length);
    expect(fake).toMatch(/^[A-Za-z0-9]{1,35}$/);
  });

  it("isRehearsalRef", () => {
    expect(isRehearsalRef(txnRefFor(true))).toBe(true);
    expect(isRehearsalRef(txnRefFor(false))).toBe(false);
    expect(isRehearsalRef("SEED1")).toBe(false);
  });
});

describe("launcherFor: the real launcher is never used in rehearsal mode", () => {
  it("rehearsal ref + rehearsal on → the fake launcher", () => {
    expect(launcherFor(txnRefFor(true), true, realLauncher)).toBe(rehearsalLauncher);
  });

  it("real ref + rehearsal off → the real launcher", () => {
    expect(launcherFor(txnRefFor(false), false, realLauncher)).toBe(realLauncher);
  });

  it.each([
    ["real ref, but rehearsal was switched on", false, true],
    ["rehearsal ref, but rehearsal was switched off", true, false],
  ])("%s → nothing is sent", (_label, rehearsalRef, on) => {
    expect(launcherFor(txnRefFor(rehearsalRef), on, realLauncher)).toBeNull();
  });

  it("the fake launcher reports success without opening anything", async () => {
    jest.useFakeTimers();
    const result = rehearsalLauncher({ payee: MUMMY, amountPaise: 100, txnRef: txnRefFor(true) });
    jest.advanceTimersByTime(1000);
    await expect(result).resolves.toBe("success");
    jest.useRealTimers();
  });
});

describe("rehearsal setting (persisted)", () => {
  it("is off by default", async () => {
    const setting = createRehearsalSetting(memoryStore());
    expect(setting.get()).toBe(false);
    expect(await setting.load()).toBe(false);
  });

  it("set(true) survives a restart (a new instance on the same store)", async () => {
    const store = memoryStore();
    await createRehearsalSetting(store).set(true);
    expect(await createRehearsalSetting(store).load()).toBe(true);
  });

  it("an unreadable store reads as off", async () => {
    const broken = { ...memoryStore(), getItem: async () => Promise.reject(new Error("io")) };
    expect(await createRehearsalSetting(broken).load()).toBe(false);
  });

  it("notifies subscribers (the banner) and stops after unsubscribe", async () => {
    const setting = createRehearsalSetting(memoryStore());
    const seen: boolean[] = [];
    const unsubscribe = setting.subscribe((on) => seen.push(on));
    await setting.set(true);
    unsubscribe();
    await setting.set(false);
    expect(seen).toEqual([true]);
  });
});
