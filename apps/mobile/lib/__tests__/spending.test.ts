// M13 show_spending: the server sends only a period name ("this_month"); the phone works out the
// IST date range and adds up its own history. The total never leaves the phone (docs/AGENT.md
// "Display-only tools").
import { periodRange, spendingLine, spendingSummary } from "../spending";
import { MUMMY, PAPA, entry, ist } from "./fixtures";

const NOW = ist("2026-10-15T15:00:00"); // a Thursday

describe("periodRange: [from, to) in IST", () => {
  it.each([
    ["today", "2026-10-15T00:00:00", "2026-10-16T00:00:00"],
    ["yesterday", "2026-10-14T00:00:00", "2026-10-15T00:00:00"],
    ["this_week", "2026-10-12T00:00:00", "2026-10-19T00:00:00"], // weeks start on Monday
    ["this_month", "2026-10-01T00:00:00", "2026-11-01T00:00:00"],
    ["last_month", "2026-09-01T00:00:00", "2026-10-01T00:00:00"],
  ] as const)("%s", (period, from, to) => {
    expect(periodRange(period, NOW)).toEqual({ fromMs: ist(from), toMs: ist(to) });
  });

  it('"all" covers every payment', () => {
    const { fromMs, toMs } = periodRange("all", NOW);
    expect(fromMs).toBeLessThanOrEqual(0);
    expect(toMs).toBeGreaterThan(NOW);
  });

  it("IST, not UTC: at 00:30 IST on 1 Nov (still 31 Oct in UTC) this month is November", () => {
    expect(periodRange("this_month", ist("2026-11-01T00:30:00"))).toEqual({
      fromMs: ist("2026-11-01T00:00:00"),
      toMs: ist("2026-12-01T00:00:00"),
    });
  });

  it("last month in January is December of the year before", () => {
    expect(periodRange("last_month", ist("2027-01-10T12:00:00"))).toEqual({
      fromMs: ist("2026-12-01T00:00:00"),
      toMs: ist("2027-01-01T00:00:00"),
    });
  });

  it("on a Monday, this week starts today; on a Sunday, it started 6 days ago", () => {
    expect(periodRange("this_week", ist("2026-10-19T08:00:00")).fromMs).toBe(ist("2026-10-19T00:00:00"));
    expect(periodRange("this_week", ist("2026-10-18T23:00:00")).fromMs).toBe(ist("2026-10-12T00:00:00"));
  });
});

describe("spendingSummary", () => {
  const history = [
    entry({ id: "1", payeeId: PAPA.id, amountPaise: 100000, createdAt: ist("2026-10-02T10:00:00") }),
    entry({ id: "2", payeeId: PAPA.id, amountPaise: 50000, createdAt: ist("2026-10-10T10:00:00") }),
    entry({ id: "3", payeeId: PAPA.id, amountPaise: 100000, createdAt: ist("2026-10-15T09:00:00") }),
    entry({ id: "4", payeeId: PAPA.id, amountPaise: 70000, createdAt: ist("2026-09-30T23:59:00") }), // last month
    entry({ id: "5", payeeId: MUMMY.id, amountPaise: 30000, createdAt: ist("2026-10-15T08:00:00") }),
    entry({ id: "6", payeeId: PAPA.id, amountPaise: 20000, status: "failed", createdAt: ist("2026-10-11T10:00:00") }),
    entry({ id: "7", payeeId: PAPA.id, amountPaise: 40000, status: "pending", createdAt: ist("2026-10-12T10:00:00") }),
    entry({ id: "8", payeeId: PAPA.id, amountPaise: 60000, status: "unknown", createdAt: ist("2026-10-13T10:00:00") }),
  ];

  it('"Papa ko is mahine kitna bheja?" → ₹2,500 in 3 payments (AGENT.md example 2)', () => {
    expect(spendingSummary({ history, payeeId: PAPA.id, period: "this_month", now: NOW })).toEqual({
      totalPaise: 250000,
      count: 3,
      unconfirmedCount: 2, // the pending and the unknown one: shown, never added
    });
  });

  it("only successful payments are added up; failed ones are left out entirely", () => {
    const s = spendingSummary({ history, payeeId: PAPA.id, period: "all", now: NOW });
    expect(s).toEqual({ totalPaise: 320000, count: 4, unconfirmedCount: 2 });
  });

  it("no payee → everyone", () => {
    expect(spendingSummary({ history, period: "today", now: NOW })).toEqual({ totalPaise: 130000, count: 2, unconfirmedCount: 0 });
  });

  it("the edges of the range: 23:59 on the last day of last month is last month", () => {
    expect(spendingSummary({ history, payeeId: PAPA.id, period: "last_month", now: NOW })).toEqual({
      totalPaise: 70000,
      count: 1,
      unconfirmedCount: 0,
    });
  });

  it("no payments → zero", () => {
    expect(spendingSummary({ history: [], payeeId: PAPA.id, period: "this_month", now: NOW })).toEqual({
      totalPaise: 0,
      count: 0,
      unconfirmedCount: 0,
    });
  });
});

describe("spendingLine: the text on the card (built by the phone, never by the AI)", () => {
  it.each([
    [{ totalPaise: 250000, count: 3, unconfirmedCount: 0 }, "₹2,500 in 3 payments"],
    [{ totalPaise: 50000, count: 1, unconfirmedCount: 0 }, "₹500 in 1 payment"],
    [{ totalPaise: 0, count: 0, unconfirmedCount: 0 }, "No payments"],
    [{ totalPaise: 250000, count: 3, unconfirmedCount: 2 }, "₹2,500 in 3 payments (+2 not confirmed)"],
    [{ totalPaise: 0, count: 0, unconfirmedCount: 1 }, "No payments (+1 not confirmed)"],
  ])("%j → %j", (summary, line) => {
    expect(spendingLine(summary)).toBe(line);
  });
});
