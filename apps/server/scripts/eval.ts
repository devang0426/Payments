// M12 eval: real conversations against a running server + the real AI (costs a few cents; not part
// of npm test). Cases: scripts/evals/turns.json.
// - "turn" cases: what POST /turn makes of a conversation ("@amount" / "@payee" = the app's question).
// - "voice" cases: the phone's own decideVoice (apps/mobile/lib/voiceConfirm.ts, pure) for a Confirm
//   card, with /turn behind it when the speech may be a change. A card may be amber or red with an offer.
// - M13 "screen" cases: the phone's pre-filter (apps/mobile/lib/prefilter.ts); nothing is sent.
// - M13 "reminderHeard" cases: the phone's decideSaveVoice for a reminder card (no server).
// - M14 --agent: Home's conversation goes to POST /agent instead (the Confirm card's voice cases still
//   use /turn, as on the phone). find_payee is answered by a fake phone ("one", or "none" for a case's
//   `unsaved` names). Agent-only cases (several payments, the new tools): scripts/evals/agent.json.
//   Prints the LLM steps per user turn and the p50/p95 latency per request.
// Usage: npm run eval            (default http://localhost:3000)
//        npm run eval -- https://<your-vercel-url>
//        npm run eval -- http://localhost:3999 --agent
import { readFileSync } from "node:fs";

import { screenText } from "../../mobile/lib/prefilter.ts";
import { decideSaveVoice, decideVoice, type TurnOutcome, type VoiceCard } from "../../mobile/lib/voiceConfirm.ts";

const cliArgs = process.argv.slice(2);
const agentMode = cliArgs.includes("--agent");
const baseUrl = (cliArgs.find((a) => !a.startsWith("--")) ?? "http://localhost:3000").replace(/\/+$/, "");
const QUESTIONS: Record<string, string> = {
  "@amount": "How much do you want to send?",
  "@payee": "Who do you want to pay?",
  "@exact": 'How much exactly? Say the full amount, like "teen sau".',
};

type Expect = {
  action: string;
  name?: string;
  paise?: number;
  last?: boolean;
  period?: string;
  when?: object;
  message?: string;
  limit?: number;
  key?: string; // M15
  value?: string;
  alias?: string;
};
type TurnCase = { id: string; group: string; turns: string[]; awaiting?: string; expect: Expect[] };
type AgentCase = { id: string; group: string; turns: string[]; awaiting?: string; unsaved?: string[]; expectActions: Expect[][] };
type VoiceCase = {
  id: string;
  group: string;
  card: { name: string; paise: number; tone?: "green" | "amber" | "red"; offerPaise?: number; amberStep?: 1 | 2 };
  heard: string;
  heardAtMs?: number;
  spokenText?: string;
  expect: string;
};
type ScreenCase = { id: string; group: string; screen: string; expect: "ok" | "upiId" | "phone" };
type SaveVoiceCase = { id: string; group: string; reminderHeard: string; expect: string };
type Case = TurnCase | VoiceCase | ScreenCase | SaveVoiceCase | AgentCase;

const load = (file: string) => (JSON.parse(readFileSync(new URL(`./evals/${file}`, import.meta.url), "utf8")) as { cases: Case[] }).cases;
const cases = [...load("turns.json"), ...(agentMode ? load("agent.json") : [])];

type TurnAnswer = {
  ok: boolean;
  action?: string;
  name?: string;
  amount?: { kind: string; paise?: number };
  period?: string;
  when?: object;
  message?: string;
  limit?: number;
  key?: string;
  value?: string;
  alias?: string;
};

// Latency of every request, and LLM steps per agent user turn.
const latencies: number[] = [];
const agentSteps: number[] = [];

// /turn allows 30 requests a minute per IP. Stay under it (one request every 2.1 s), and if the limit
// is hit anyway (e.g. a run right after another), wait for the window to pass and try once more, so
// the result measures the AI, not our own limiter.
const MIN_GAP_MS = 2100;
let lastCall = 0;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function post<T>(path: string, body: unknown, retried = false): Promise<T | null> {
  await wait(Math.max(0, lastCall + MIN_GAP_MS - Date.now()));
  lastCall = Date.now();
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 429 && !retried) {
      console.log("      (rate limit hit: waiting 61 s, then trying again)");
      await wait(61_000);
      return post(path, body, true);
    }
    const answer = (await res.json()) as T;
    latencies.push(Date.now() - lastCall);
    return answer;
  } catch {
    return null;
  }
}

const postTurn = (turns: { role: string; text: string }[], awaiting?: string) =>
  post<TurnAnswer>("/turn", { turns, ...(awaiting ? { awaiting } : {}) });

// /agent, with a fake phone that runs find_payee: "none" for the case's unsaved names, else "one".
type AgentAnswer = { ok: boolean; actions?: TurnAnswer[]; pending?: { id: string; tool: string; name: string }[] };
async function postAgent(turns: { role: string; text: string }[], awaiting?: string, unsaved: string[] = []): Promise<TurnAnswer[] | null> {
  const steps: { id: string; nameText: string; match: string; count: number }[][] = [];
  for (let step = 1; step <= 4; step++) {
    const answer = await post<AgentAnswer>("/agent", { turns, ...(awaiting ? { awaiting } : {}), ...(steps.length ? { steps } : {}) });
    if (!answer?.ok) return null;
    if (answer.actions) {
      agentSteps.push(step);
      return answer.actions.map((a) => ({ ok: true, ...a }));
    }
    const none = new Set(unsaved.map((u) => u.toLowerCase()));
    steps.push(
      (answer.pending ?? []).map((p) => {
        const missing = none.has(p.name.toLowerCase());
        return { id: p.id, nameText: p.name, match: missing ? "none" : "one", count: missing ? 0 : 1 };
      }),
    );
  }
  return null;
}

// An agent answer read as one /turn action, for the turns.json cases: a "tell" alone means nothing
// proceeds (like "unknown"); a leading cancel before a change is how a correction comes back.
function asTurnAnswer(actions: TurnAnswer[] | null): TurnAnswer | null {
  if (!actions) return null;
  const real = actions.filter((a) => a.action !== "tell");
  if (real.length === 0) return { ok: true, action: "unknown" };
  const rest = real.length > 1 && real[0]!.action === "cancel" ? real.slice(1) : real;
  return rest.length === 1 ? rest[0]! : { ok: true, action: `several: ${rest.map((a) => a.action).join(",")}` };
}

function matches(answer: TurnAnswer | null, e: Expect): boolean {
  if (!answer?.ok || answer.action !== e.action) return false;
  if (e.message !== undefined && e.message !== answer.message) return false;
  if (e.limit !== undefined && e.limit !== answer.limit) return false;
  if (e.key !== undefined && (e.key !== answer.key || e.value !== answer.value)) return false;
  if (e.alias !== undefined && e.alias.toLowerCase() !== answer.alias?.toLowerCase()) return false;
  if ((e.name ?? null) !== (answer.name ?? null)) return false;
  if ((e.period ?? null) !== (answer.period ?? null)) return false;
  if (JSON.stringify(e.when ?? null) !== JSON.stringify(answer.when ?? null)) return false;
  if (e.last) return answer.amount?.kind === "last";
  return (e.paise ?? null) === (answer.amount?.kind === "paise" ? answer.amount.paise : null);
}

const describe = (a: TurnAnswer | null) =>
  !a
    ? "no answer"
    : !a.ok
      ? "error"
      : JSON.stringify({ action: a.action, name: a.name, amount: a.amount, period: a.period, when: a.when, message: a.message, limit: a.limit });

const toTurns = (texts: string[]) => texts.map((t) => (QUESTIONS[t] ? { role: "assistant", text: QUESTIONS[t] } : { role: "user", text: t }));

async function runTurnCase(c: TurnCase): Promise<{ pass: boolean; got: string }> {
  const turns = toTurns(c.turns);
  const answer = agentMode ? asTurnAnswer(await postAgent(turns, c.awaiting === "draft" ? undefined : c.awaiting)) : await postTurn(turns, c.awaiting);
  return { pass: c.expect.some((e) => matches(answer, e)), got: describe(answer) };
}

async function runAgentCase(c: AgentCase): Promise<{ pass: boolean; got: string }> {
  const actions = await postAgent(toTurns(c.turns), c.awaiting, c.unsaved);
  const pass = !!actions && c.expectActions.some((seq) => seq.length === actions.length && seq.every((e, i) => matches(actions[i]!, e)));
  return { pass, got: actions ? actions.map(describe).join(" + ") : "no answer" };
}

// The phone's reading of /turn for a card (simplified payee matching: the card's own name or another).
async function outcomeFor(c: VoiceCase): Promise<TurnOutcome> {
  const answer = await postTurn([{ role: "user", text: c.heard }], "draft");
  if (!answer) return { kind: "failed" };
  if (!answer.ok) return { kind: "failed" };
  if (answer.action === "ask_exact") return { kind: "relative" };
  if (answer.action !== "pay" && answer.action !== "set_amount" && answer.action !== "set_payee") return { kind: "other" };
  if (answer.amount?.kind === "last") return { kind: "other" };
  const paise = answer.amount?.paise ?? c.card.paise;
  const samePayee = !answer.name || answer.name.trim().toLowerCase() === c.card.name.toLowerCase();
  return { kind: "change", payeeId: samePayee ? "card-payee" : "other-payee", paise };
}

async function runVoiceCase(c: VoiceCase): Promise<{ pass: boolean; got: string }> {
  const T = 1_000_000;
  const card: VoiceCard = {
    txnRef: "FP1",
    payeeId: "card-payee",
    paise: c.card.paise,
    tone: c.card.tone ?? "green",
    reasks: 0,
    ...(c.card.offerPaise ? { offerPaise: c.card.offerPaise } : {}),
    ...(c.card.amberStep ? { amberStep: c.card.amberStep } : {}),
  };
  const input = {
    card,
    currentTxnRef: "FP1",
    used: false,
    heard: {
      transcript: c.heard,
      forTxnRef: "FP1",
      listenStartedAt: T,
      resultAt: T + (c.heardAtMs ?? 1500),
      lastSpoken: c.spokenText ?? `Send ${c.card.paise / 100} rupees to ${c.card.name}?`,
    },
  };
  let decision = decideVoice(input);
  let via = "phone only";
  if (decision.kind === "askServer") {
    const outcome = await outcomeFor(c);
    decision = decideVoice(input, outcome);
    via = `/turn → ${JSON.stringify(outcome)}`;
  }
  return { pass: decision.kind === c.expect, got: `${decision.kind} (${via})` };
}

function runScreenCase(c: ScreenCase): { pass: boolean; got: string } {
  const got = screenText(c.screen).kind;
  return { pass: got === c.expect, got };
}

function runSaveVoiceCase(c: SaveVoiceCase): { pass: boolean; got: string } {
  const T = 1_000_000;
  const { kind } = decideSaveVoice({
    cardId: "R1",
    currentId: "R1",
    used: false,
    heard: { transcript: c.reminderHeard, forId: "R1", listenStartedAt: T, resultAt: T + 1500, lastSpoken: "Remind you on 1 November to send 2000 rupees to Mummy?" },
  });
  return { pass: kind === c.expect, got: kind };
}

// In --agent mode, turns.json cases "on the card" (awaiting: draft) are skipped: on the phone the
// Confirm card's speech goes to /turn, not /agent (its voice cases still run, through /turn).
const skipped = (c: Case) => agentMode && "turns" in c && "expect" in c && c.awaiting === "draft";

async function runCase(c: Case) {
  if ("screen" in c) return runScreenCase(c);
  if ("reminderHeard" in c) return runSaveVoiceCase(c);
  if ("expectActions" in c) return runAgentCase(c);
  return "heard" in c ? runVoiceCase(c) : runTurnCase(c);
}

function labelOf(c: Case): string {
  if ("expectActions" in c) return c.turns.join(" | ");
  if ("screen" in c) return `pre-filter: "${c.screen}"`;
  if ("reminderHeard" in c) return `"${c.reminderHeard}" on a reminder card`;
  if ("heard" in c) return `"${c.heard}" on a ${c.card.tone ?? "green"} ₹${c.card.paise / 100} card`;
  return c.turns.join(" | ");
}

const results: { c: Case; pass: boolean; got: string }[] = [];
for (const c of cases) {
  if (skipped(c)) {
    console.log(`SKIP  ${c.id} [${c.group}] (a Confirm-card turn: /turn on the phone)`);
    continue;
  }
  const r = await runCase(c);
  results.push({ c, ...r });
  const label = labelOf(c);
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${c.id} [${c.group}] ${label}${r.pass ? "" : `\n      got: ${r.got}`}`);
}

const byGroup = new Map<string, { pass: number; total: number }>();
for (const r of results) {
  const g = byGroup.get(r.c.group) ?? { pass: 0, total: 0 };
  g.total++;
  if (r.pass) g.pass++;
  byGroup.set(r.c.group, g);
}
const passed = results.filter((r) => r.pass).length;
const pct = (n: number, d: number) => `${Math.round((100 * n) / d)}%`;
console.log(`\n${agentMode ? "[/agent] " : ""}${passed}/${results.length} passed (${pct(passed, results.length)})`);
for (const [group, g] of byGroup) console.log(`  ${group}: ${g.pass}/${g.total}`);

const sorted = [...latencies].sort((a, b) => a - b);
const pctl = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
if (sorted.length) console.log(`latency per request: p50 ${pctl(50)} ms, p95 ${pctl(95)} ms (${sorted.length} requests)`);
if (agentSteps.length) {
  const one = agentSteps.filter((s) => s === 1).length;
  console.log(`LLM steps per user turn: ${one}/${agentSteps.length} took 1 step, max ${Math.max(...agentSteps)}`);
}

// Gate (docs/AGENT.md): ≥ 95% overall, 100% on refuse/ask, the voice guards and the pre-filter.
const strict = ["refuseAsk", "voiceGuard", "prefilter"].every((g) => {
  const s = byGroup.get(g);
  return !s || s.pass === s.total;
});
const gateOk = passed / results.length >= 0.95 && strict;
console.log(gateOk ? "\nGATE: PASS" : "\nGATE: FAIL (need ≥ 95% overall and 100% on refuseAsk + voiceGuard + prefilter)");
process.exitCode = gateOk ? 0 : 1;
