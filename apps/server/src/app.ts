import express, { type ErrorRequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { AgentRequest, runAgent, type AgentResponse } from "./agent.js";
import {
  callAgent as openRouterAgent,
  extractPayment,
  extractTurn as openRouterTurn,
  type AgentCaller,
  type Extractor,
  type TurnExtractor,
} from "./llm.js";
import { ParseRequest, parseCommand, type ParseResponse } from "./parse.js";
import { TurnRequest, runTurn, type TurnResponse } from "./turn.js";

type AppOptions = {
  extract?: Extractor; // tests pass a fake; production uses OpenRouter
  extractTurn?: TurnExtractor; // same, for /turn
  callAgent?: AgentCaller; // same, for /agent (M14)
  parseRequestsPerMinute?: number;
  turnRequestsPerMinute?: number;
  agentRequestsPerMinute?: number;
  // Behind Vercel's proxy the client IP is in X-Forwarded-For. Off locally, so it can't be spoofed.
  trustProxy?: boolean;
};

const sendParse = (res: express.Response, status: number, body: ParseResponse | TurnResponse | AgentResponse) =>
  res.status(status).json(body);

// The Express app without app.listen(), so tests and Vercel can import it directly.
export function createApp({
  extract = extractPayment,
  extractTurn = openRouterTurn,
  callAgent = openRouterAgent,
  parseRequestsPerMinute = 30,
  turnRequestsPerMinute = 30,
  agentRequestsPerMinute = 30,
  trustProxy = !!process.env.VERCEL,
}: AppOptions = {}) {
  const app = express();
  if (trustProxy) app.set("trust proxy", 1);

  app.use(express.json({ limit: "10kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  const parseLimiter = rateLimit({
    windowMs: 60_000,
    limit: parseRequestsPerMinute,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => sendParse(res, 429, { ok: false, error: "AI_FAILED" }),
  });

  app.post("/parse", parseLimiter, async (req, res) => {
    const body = ParseRequest.safeParse(req.body);
    if (!body.success) return sendParse(res, 400, { ok: false, error: "BAD_INPUT" });

    const result = await parseCommand(body.data.text, extract);
    if (!result.ok) {
      // Only the error type is logged, never the user's text.
      console.warn(`parse: ${result.error}`);
      return sendParse(res, result.error === "AI_FAILED" ? 502 : 200, result);
    }
    return sendParse(res, 200, result);
  });

  // One conversation step (M12). Its own limit, so a chatty conversation can't use up /parse's.
  const turnLimiter = rateLimit({
    windowMs: 60_000,
    limit: turnRequestsPerMinute,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => sendParse(res, 429, { ok: false, error: "AI_FAILED" }),
  });

  app.post("/turn", turnLimiter, async (req, res) => {
    const body = TurnRequest.safeParse(req.body);
    if (!body.success) return sendParse(res, 400, { ok: false, error: "BAD_INPUT" });

    const result = await runTurn(body.data, extractTurn);
    // Only the action or error type is logged, never the conversation.
    if (!result.ok) {
      console.warn(`turn: ${result.error}`);
      return sendParse(res, 502, result);
    }
    if (result.action === "unknown" || result.action === "ask_exact") console.warn(`turn: ${result.action}`);
    return sendParse(res, 200, result);
  });

  // One agent step (M14). Its own limit; a user turn takes 1–4 of these.
  const agentLimiter = rateLimit({
    windowMs: 60_000,
    limit: agentRequestsPerMinute,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => sendParse(res, 429, { ok: false, error: "AI_FAILED" }),
  });

  app.post("/agent", agentLimiter, async (req, res) => {
    const body = AgentRequest.safeParse(req.body);
    if (!body.success) return sendParse(res, 400, { ok: false, error: "BAD_INPUT" });

    const started = Date.now();
    let info = "";
    const result = await runAgent(body.data, callAgent, (s) => {
      info = `step=${s.step} tools=${s.tools.join(",") || "none"}${s.model ? ` model=${s.model}` : ""}${s.error ? ` error=${s.error}` : ""}`;
    });
    // Only the step, tool names, model, latency and outcome type are logged; never the conversation,
    // the spans, the tool arguments or the model output.
    const outcome = !result.ok ? result.error : "pending" in result ? "pending" : result.actions.map((a) => a.action).join(",");
    console.info(`agent: ${info || "step=?"} ms=${Date.now() - started} -> ${outcome}`);
    return sendParse(res, result.ok ? 200 : 502, result);
  });

  // Malformed JSON, oversized body, or any unexpected error: never echo the request back.
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    const status = typeof err?.status === "number" ? err.status : 500;
    console.warn(`request error: ${err?.type ?? err?.name ?? "unknown"}`);
    if (status >= 400 && status < 500) return sendParse(res, 400, { ok: false, error: "BAD_INPUT" });
    return sendParse(res, 500, { ok: false, error: "AI_FAILED" });
  };
  app.use(onError);

  return app;
}

export default createApp();
