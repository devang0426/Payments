import { z } from "zod";

import { MESSAGE_IDS, type AgentReply, type AgentRequestBody } from "./agent";
import type { ConversationTurn, ServerAction } from "./conversation";
import type { Amount } from "./flow";
import { screenText } from "./prefilter";
import { WhenSchema } from "./reminders";

export type HealthStatus = "ok" | "down" | "not-configured";

const HEALTH_TIMEOUT_MS = 5000;
// /parse gets one retry, only when the request itself failed (network error or timeout); never when
// the server answered. Two attempts of 7 s keep the total under 15 s.
const PARSE_ATTEMPT_TIMEOUT_MS = 7000;
const PARSE_ATTEMPTS = 2;
const MAX_TEXT_LENGTH = 300;

export function getApiUrl(): string | undefined {
  const url = process.env.EXPO_PUBLIC_API_URL?.trim();
  return url ? url.replace(/\/+$/, "") : undefined;
}

// GET {apiUrl}/health. Any network error, timeout or unexpected body counts as "down".
export async function checkHealth(apiUrl: string | undefined = getApiUrl()): Promise<HealthStatus> {
  if (!apiUrl) return "not-configured";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiUrl}/health`, { signal: controller.signal });
    if (!res.ok) return "down";
    const body: unknown = await res.json();
    return typeof body === "object" && body !== null && (body as { ok?: unknown }).ok === true
      ? "ok"
      : "down";
  } catch {
    return "down";
  } finally {
    clearTimeout(timer);
  }
}

// Server /parse response (contract from M2). Anything else is treated as a failure.
const ParseResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    name: z.string().trim().min(1),
    amount: z.union([
      z.object({ kind: z.literal("paise"), paise: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }),
      z.object({ kind: z.literal("last") }),
    ]),
  }),
  z.object({ ok: z.literal(false), error: z.enum(["NO_NAME", "NO_AMOUNT", "AI_FAILED", "BAD_INPUT"]) }),
]);

// What the phone needs: a name + integer paise, or why not. FAILED covers network, timeout,
// server/AI errors and unexpected responses: the payment never proceeds.
export type ParseResult =
  | { ok: true; name: string; amount: Amount }
  | { ok: false; error: "NO_NAME" | "NO_AMOUNT" | "FAILED" };

// One POST: the server's answer, or answered: false when none came (network error or timeout).
async function postJson(url: string, body: unknown): Promise<{ answered: true; res: Response } | { answered: false }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PARSE_ATTEMPT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return { answered: true, res };
  } catch {
    return { answered: false };
  } finally {
    clearTimeout(timer);
  }
}

const NO_ANSWER = Symbol("no answer");

// POST with one retry when no answer came; never retried once the server answered. Returns the
// response body (not yet validated), or NO_ANSWER for a network failure, timeout or non-JSON body.
async function postWithRetry(url: string, body: unknown): Promise<unknown> {
  for (let attempt = 1; attempt <= PARSE_ATTEMPTS; attempt++) {
    const sent = await postJson(url, body);
    if (!sent.answered) continue;
    try {
      return await sent.res.json();
    } catch {
      return NO_ANSWER;
    }
  }
  return NO_ANSWER;
}

// POST {apiUrl}/parse with only the text. Never logs the text.
export async function parseText(text: string, apiUrl: string | undefined = getApiUrl()): Promise<ParseResult> {
  const trimmed = text.trim();
  if (!apiUrl || !trimmed || trimmed.length > MAX_TEXT_LENGTH) return { ok: false, error: "FAILED" };
  if (screenText(trimmed).kind !== "ok") return { ok: false, error: "FAILED" }; // pre-filter backstop

  const parsed = ParseResponseSchema.safeParse(await postWithRetry(`${apiUrl}/parse`, { text: trimmed }));
  if (!parsed.success) return { ok: false, error: "FAILED" };

  const body = parsed.data;
  if (!body.ok) {
    return body.error === "NO_NAME" || body.error === "NO_AMOUNT"
      ? { ok: false, error: body.error }
      : { ok: false, error: "FAILED" };
  }
  // kind "last" = "same as last time": the phone resolves it from its own history.
  return { ok: true, name: body.name.trim(), amount: body.amount };
}

// Server /turn response (M12): one action, amounts already in integer paise (or "last").
const AmountSchema = z.union([
  z.object({ kind: z.literal("paise"), paise: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }),
  z.object({ kind: z.literal("last") }),
]);
const Name = z.string().trim().min(1);
const TurnResponseSchema = z.union([
  z.object({ ok: z.literal(true), action: z.literal("pay"), name: Name.optional(), amount: AmountSchema.optional() }),
  z.object({ ok: z.literal(true), action: z.literal("set_amount"), amount: AmountSchema }),
  z.object({ ok: z.literal(true), action: z.literal("set_payee"), name: Name }),
  z.object({
    ok: z.literal(true),
    action: z.literal("show_spending"),
    name: Name.optional(),
    period: z.enum(["today", "yesterday", "this_week", "this_month", "last_month", "all"]),
  }),
  z.object({ ok: z.literal(true), action: z.literal("create_reminder"), name: Name, amount: AmountSchema.optional(), when: WhenSchema }),
  z.object({ ok: z.literal(true), action: z.enum(["cancel", "unknown", "ask_exact"]) }),
]);

// blocked: a user turn has a UPI ID or phone number, so nothing was sent (M13 pre-filter backstop).
export type TurnResult = { ok: true; action: ServerAction } | { ok: false; blocked?: true };

// POST {apiUrl}/turn with only the conversation (role + text) and what the app is waiting for.
// Any failure (network, timeout, AI, unexpected body) → ok: false: nothing proceeds.
export async function sendTurn(
  turns: ConversationTurn[],
  awaiting: "amount" | "payee" | "draft" | null,
  apiUrl: string | undefined = getApiUrl(),
): Promise<TurnResult> {
  if (!apiUrl || turns.length === 0 || turns.at(-1)!.role !== "user") return { ok: false };
  // Earlier user turns are re-sent too, so every one is checked. Screens check first; this is the backstop.
  if (turns.some((t) => t.role === "user" && screenText(t.text).kind !== "ok")) return { ok: false, blocked: true };
  const body = { turns: turns.map(({ role, text }) => ({ role, text })), ...(awaiting ? { awaiting } : {}) };
  const parsed = TurnResponseSchema.safeParse(await postWithRetry(`${apiUrl}/turn`, body));
  if (!parsed.success) return { ok: false };
  const { ok: _ok, ...action } = parsed.data;
  return { ok: true, action: action as ServerAction };
}

// Server /agent response (M14): the actions for this user turn, or find_payee calls for the phone to
// run first. Anything else is a failure. Amounts are already integer paise (or "last").
const AgentActionSchema = z.union([
  z.object({ action: z.literal("pay"), name: Name.optional(), amount: AmountSchema.optional() }),
  z.object({ action: z.literal("set_amount"), amount: AmountSchema }),
  z.object({ action: z.literal("set_payee"), name: Name }),
  z.object({ action: z.literal("show_spending"), name: Name.optional(), period: z.enum(["today", "yesterday", "this_week", "this_month", "last_month", "all"]) }),
  z.object({ action: z.literal("create_reminder"), name: Name, amount: AmountSchema.optional(), when: WhenSchema }),
  z.object({ action: z.enum(["cancel", "unknown", "ask_exact"]) }),
  z.object({ action: z.literal("show_recent"), name: Name.optional(), limit: z.number().int().min(1).max(10) }),
  z.object({ action: z.literal("show_limit_left") }),
  z.object({ action: z.literal("tell"), message: z.enum(MESSAGE_IDS) }),
  // M15
  z.object({
    action: z.literal("set_preference"),
    key: z.enum(["reply_language", "speak_replies", "mic_language"]),
    value: z.enum(["english", "hindi", "auto", "on", "off"]),
  }),
  z.object({ action: z.literal("suggest_alias"), alias: Name.pipe(z.string().max(50)), name: Name.pipe(z.string().max(50)) }),
  z.object({ action: z.literal("explain_last") }),
]);
const AgentResponseSchema = z.union([
  z.object({ ok: z.literal(true), actions: z.array(AgentActionSchema).min(1).max(4) }),
  z.object({
    ok: z.literal(true),
    pending: z.array(z.object({ id: z.string().regex(/^[\w.:-]{1,64}$/), tool: z.literal("find_payee"), name: Name })).min(1).max(6),
  }),
]);

// POST {apiUrl}/agent: the conversation (role + text), what the app waits for, and this turn's
// find_payee results (match type + count only). Any failure → ok: false: nothing proceeds.
export async function sendAgent(body: AgentRequestBody, apiUrl: string | undefined = getApiUrl()): Promise<AgentReply> {
  const { turns } = body;
  if (!apiUrl || turns.length === 0 || turns.at(-1)!.role !== "user") return { ok: false };
  if (turns.some((t) => t.role === "user" && screenText(t.text).kind !== "ok")) return { ok: false, blocked: true };
  const parsed = AgentResponseSchema.safeParse(
    await postWithRetry(`${apiUrl}/agent`, { ...body, turns: turns.map(({ role, text }) => ({ role, text })) }),
  );
  return parsed.success ? (parsed.data as AgentReply) : { ok: false };
}
