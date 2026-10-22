import { READY_CHECK_IDS, allReady, readyRows, type ReadyFacts } from "../readyCheck";
import { strings } from "../strings";

const GOOD: ReadyFacts = {
  health: "ok",
  parse: "ok",
  mic: "granted",
  contacts: "granted",
  ttsEnIn: true,
  upiApp: true,
  payees: 2,
  historyReadable: true,
  remainingPaise: 500000,
  rehearsalOn: false,
  rehearsalEntries: 0,
  notifications: "granted",
  helperSaved: true,
};

const failing = (facts: Partial<ReadyFacts>) =>
  readyRows({ ...GOOD, ...facts })
    .filter((r) => !r.ok)
    .map((r) => r.id);

describe("readyRows", () => {
  it("all good → every row ✅, in the fixed order", () => {
    const rows = readyRows(GOOD);
    expect(rows.map((r) => r.id)).toEqual([...READY_CHECK_IDS]);
    expect(allReady(rows)).toBe(true);
  });

  it.each<[string, Partial<ReadyFacts>, string[]]>([
    ["server down", { health: "down", parse: "skipped" }, ["server", "parse"]],
    ["server URL not set", { health: "not-configured", parse: "skipped" }, ["server", "parse"]],
    ["server up, /parse fails (key, model, credit)", { parse: "failed" }, ["parse"]],
    ["server up, /parse gives the wrong amount", { parse: "wrong" }, ["parse"]],
    ["mic not asked yet (pop-up would appear)", { mic: "undetermined" }, ["mic"]],
    ["mic denied", { mic: "denied" }, ["mic"]],
    ["no in-app mic (Expo Go)", { mic: "unavailable" }, ["mic"]],
    ["contacts not asked yet", { contacts: "undetermined" }, ["contacts"]],
    ["no en-IN voice", { ttsEnIn: false }, ["tts"]],
    ["no UPI app", { upiApp: false }, ["upiApp"]],
    ["no payees", { payees: 0 }, ["payees"]],
    ["unreadable history", { historyReadable: false }, ["history"]],
    ["daily limit used up", { remainingPaise: 0 }, ["limit"]],
    ["rehearsal mode on", { rehearsalOn: true }, ["rehearsalOff"]],
    ["rehearsal payments left", { rehearsalEntries: 3 }, ["rehearsalEntries"]],
    // Polish: reminders need notifications; the "Call …" button needs a family helper.
    ["notifications not asked yet", { notifications: "undetermined" }, ["notifications"]],
    ["notifications denied", { notifications: "denied" }, ["notifications"]],
    ["a build without notifications", { notifications: "unavailable" }, ["notifications"]],
    ["no family helper saved", { helperSaved: false }, ["helper"]],
  ])("%s → ❌ %j", (_label, facts, expected) => {
    expect(failing(facts)).toEqual(expected);
    expect(allReady(readyRows({ ...GOOD, ...facts }))).toBe(false);
  });

  it("contacts denied is fine: no pop-up can appear, the hint just reads differently", () => {
    expect(failing({ contacts: "denied" })).toEqual([]);
  });

  it("some limit left is enough", () => {
    expect(failing({ remainingPaise: 1 })).toEqual([]);
  });

  it("every row has a label and a fix line", () => {
    for (const id of READY_CHECK_IDS) {
      expect(strings.readyCheck.rows[id].label).toBeTruthy();
      expect(strings.readyCheck.rows[id].fix).toBeTruthy();
    }
  });
});
