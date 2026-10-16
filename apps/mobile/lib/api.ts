import { z } from "zod";

import type { Amount } from "./flow";

export type HealthStatus = "ok" | "down" | "not-configured";

const HEALTH_TIMEOUT_MS = 5000;
const PARSE_TIMEOUT_MS = 12_000;
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

// POST {apiUrl}/parse with only the text. Never logs the text.
export async function parseText(text: string, apiUrl: string | undefined = getApiUrl()): Promise<ParseResult> {
  const trimmed = text.trim();
  if (!apiUrl || !trimmed || trimmed.length > MAX_TEXT_LENGTH) return { ok: false, error: "FAILED" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiUrl}/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed }),
      signal: controller.signal,
    });
    const parsed = ParseResponseSchema.safeParse(await res.json());
    if (!parsed.success) return { ok: false, error: "FAILED" };

    const body = parsed.data;
    if (!body.ok) {
      return body.error === "NO_NAME" || body.error === "NO_AMOUNT"
        ? { ok: false, error: body.error }
        : { ok: false, error: "FAILED" };
    }
    // kind "last" = "same as last time": the phone resolves it from its own history.
    return { ok: true, name: body.name.trim(), amount: body.amount };
  } catch {
    return { ok: false, error: "FAILED" };
  } finally {
    clearTimeout(timer);
  }
}
