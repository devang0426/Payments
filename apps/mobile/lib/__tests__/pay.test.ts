// sendPayment re-checks everything right before the UPI app opens: the payee and history are read
// again from storage, and nothing is written or launched unless the rules still pass.
import { createHistoryStore } from "../history";
import { paymentInFlight, sendPayment, type Launcher, type StallWatcher } from "../pay";
import { createPayeeStore, type Payee } from "../payees";
import { ist, memoryStore } from "./fixtures";

const NOW = ist("2026-10-15T15:00:00");
const HOUR = 60 * 60 * 1000;

let clockNow = NOW;
const clock = () => clockNow;

async function setup() {
  const payees = createPayeeStore(memoryStore(), () => "p1", clock);
  const history = createHistoryStore(memoryStore());
  clockNow = NOW - 7 * 24 * HOUR; // saved a week ago: no new-payee limit
  const added = await payees.add({ displayName: "Mummy", vpa: "mummy.fake@upi" });
  clockNow = NOW;
  if (!added.ok) throw new Error("setup");
  return { payees, history, payee: added.payee };
}

// A launcher that records whether it ran and what history looked like at that moment.
function spyLauncher(history: ReturnType<typeof createHistoryStore>, result: "success" | "failed" | "unknown" = "success") {
  const calls: { pendingAtLaunch: boolean }[] = [];
  const launch: Launcher = async ({ txnRef }) => {
    const { entries } = await history.load();
    calls.push({ pendingAtLaunch: entries.some((e) => e.txnRef === txnRef && e.status === "pending") });
    return result;
  };
  return { launch, calls };
}

const neverStalls: StallWatcher = () => () => {};

const send = (
  deps: { payees: ReturnType<typeof createPayeeStore>; history: ReturnType<typeof createHistoryStore> },
  payee: Payee,
  launch: Launcher,
  amountPaise = 50000,
  txnRef = "FP1",
  watchStall: StallWatcher = neverStalls,
) => sendPayment({ payee, amountPaise, txnRef, now: NOW }, launch, deps, watchStall);

// A launcher whose result the test hands over later (or never), and a stall the test fires by hand.
function controlledLaunch() {
  let settle: { resolve: (s: "success" | "failed" | "unknown") => void; reject: (e: Error) => void } | null = null;
  const launch: Launcher = () => new Promise((resolve, reject) => (settle = { resolve, reject }));
  return { launch, settle: () => settle! };
}
function manualStall() {
  let fire: (() => void) | null = null;
  let stopped = false;
  const watch: StallWatcher = (onStall) => {
    fire = onStall;
    return () => {
      stopped = true;
    };
  };
  return { watch, fire: () => fire!(), stopped: () => stopped };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("sendPayment: the UPI app's result never comes back (FlowPay recreated while PhonePe was open)", () => {
  it("a stall → unknown (counts toward the limit, the receipt asks), and the payment is no longer in flight", async () => {
    const { payees, history, payee } = await setup();
    const { launch } = controlledLaunch();
    const stall = manualStall();
    const result = send({ payees, history }, payee, launch, 50000, "FP1", stall.watch);
    await flush();
    expect(paymentInFlight()).toBe("FP1");
    stall.fire();
    expect(await result).toEqual({ kind: "sent", status: "unknown", launchFailed: false });
    expect(paymentInFlight()).toBeNull();
    expect((await history.load()).entries[0]).toMatchObject({ txnRef: "FP1", status: "unknown" });
  });

  it("a result that still arrives after the stall is saved then", async () => {
    const { payees, history, payee } = await setup();
    const { launch, settle } = controlledLaunch();
    const stall = manualStall();
    const result = send({ payees, history }, payee, launch, 50000, "FP1", stall.watch);
    await flush();
    stall.fire();
    await result;
    settle().resolve("success");
    await flush();
    await flush();
    expect((await history.load()).entries[0]).toMatchObject({ txnRef: "FP1", status: "success" });
  });

  it("a launch error after the stall does NOT mark it failed (PhonePe was open; money may have moved)", async () => {
    const { payees, history, payee } = await setup();
    const { launch, settle } = controlledLaunch();
    const stall = manualStall();
    const result = send({ payees, history }, payee, launch, 50000, "FP1", stall.watch);
    await flush();
    stall.fire();
    await result;
    settle().reject(new Error("late"));
    await flush();
    await flush();
    expect((await history.load()).entries[0]).toMatchObject({ txnRef: "FP1", status: "unknown" });
  });

  it("a normal result stops the watcher, and a stall after it changes nothing", async () => {
    const { payees, history, payee } = await setup();
    const { launch, settle } = controlledLaunch();
    const stall = manualStall();
    const result = send({ payees, history }, payee, launch, 50000, "FP1", stall.watch);
    await flush();
    settle().resolve("success");
    expect(await result).toEqual({ kind: "sent", status: "success", launchFailed: false });
    expect(stall.stopped()).toBe(true);
    stall.fire();
    await flush();
    expect((await history.load()).entries[0]).toMatchObject({ txnRef: "FP1", status: "success" });
  });

  it("a blocked payment never starts watching", async () => {
    const { payees, history, payee } = await setup();
    await payees.remove("p1");
    const watch = jest.fn(neverStalls);
    await send({ payees, history }, payee, spyLauncher(history).launch, 50000, "FP1", watch);
    expect(watch).not.toHaveBeenCalled();
  });
});

describe("sendPayment: rules pass", () => {
  it("writes the pending entry before launching, then saves the result", async () => {
    const { payees, history, payee } = await setup();
    const { launch, calls } = spyLauncher(history);
    expect(await send({ payees, history }, payee, launch)).toEqual({
      kind: "sent",
      status: "success",
      launchFailed: false,
    });
    expect(calls).toEqual([{ pendingAtLaunch: true }]);
    expect((await history.load()).entries[0]).toMatchObject({ txnRef: "FP1", status: "success", amountPaise: 50000 });
  });

  it("the UPI app can't be opened → failed, launchFailed (no money moved)", async () => {
    const { payees, history, payee } = await setup();
    const launch: Launcher = async () => {
      throw new Error("no activity");
    };
    expect(await send({ payees, history }, payee, launch)).toEqual({ kind: "sent", status: "failed", launchFailed: true });
  });
});

describe("sendPayment: blocked at the last moment (nothing written, nothing launched)", () => {
  async function expectBlocked(
    reason: string,
    change: (s: Awaited<ReturnType<typeof setup>>) => Promise<unknown>,
    amountPaise = 50000,
  ) {
    const s = await setup();
    await change(s);
    const { launch, calls } = spyLauncher(s.history);
    const before = (await s.history.load()).entries.length;
    expect(await send({ payees: s.payees, history: s.history }, s.payee, launch, amountPaise, "FP9")).toEqual({
      kind: "blocked",
      reason,
    });
    expect(calls).toHaveLength(0);
    const after = await s.history.load();
    expect(after.entries.length).toBe(before);
    expect(after.entries.some((e) => e.txnRef === "FP9")).toBe(false);
  }

  it("the payee was deleted while the card was open → NO_PAYEE", async () => {
    await expectBlocked("NO_PAYEE", ({ payees }) => payees.remove("p1"));
  });

  it("the payee's UPI ID was changed while the card was open → PAYEE_CHANGED", async () => {
    await expectBlocked("PAYEE_CHANGED", ({ payees }) =>
      payees.update("p1", { displayName: "Mummy", vpa: "someone.else.fake@upi" }),
    );
  });

  it("another payment meanwhile pushed today over ₹5,000 → OVER_DAILY", async () => {
    await expectBlocked("OVER_DAILY", ({ history }) =>
      history.add({
        txnRef: "FP0",
        payeeId: "p1",
        payeeName: "Mummy",
        amountPaise: 480000,
        status: "success",
        createdAt: NOW - HOUR,
      }),
    );
  });

  it("history became unreadable → HISTORY_UNREADABLE", async () => {
    const s = await setup();
    const brokenHistory = createHistoryStore(memoryStore({ "flowpay.history.v1": "{not json" }));
    const { launch, calls } = spyLauncher(brokenHistory);
    expect(await send({ payees: s.payees, history: brokenHistory }, s.payee, launch)).toEqual({
      kind: "blocked",
      reason: "HISTORY_UNREADABLE",
    });
    expect(calls).toHaveLength(0);
  });

  it("the payee turns out to be new (added 1 h ago) and the amount is over ₹500 → NEW_PAYEE_LIMIT", async () => {
    const payees = createPayeeStore(memoryStore(), () => "p1", clock);
    const history = createHistoryStore(memoryStore());
    clockNow = NOW - HOUR;
    const added = await payees.add({ displayName: "Mummy", vpa: "mummy.fake@upi" });
    clockNow = NOW;
    if (!added.ok) throw new Error("setup");
    const { launch, calls } = spyLauncher(history);
    expect(await send({ payees, history }, added.payee, launch, 50001)).toEqual({
      kind: "blocked",
      reason: "NEW_PAYEE_LIMIT",
    });
    expect(calls).toHaveLength(0);
  });

  it("an amount that isn't a positive integer is blocked, not sent", async () => {
    await expectBlocked("INVALID_AMOUNT", async () => {}, 500.5);
  });
});
