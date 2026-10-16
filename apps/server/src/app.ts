import express, { type ErrorRequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { extractPayment, type Extractor } from "./llm.js";
import { ParseRequest, parseCommand, type ParseResponse } from "./parse.js";

type AppOptions = {
  extract?: Extractor; // tests pass a fake; production uses OpenRouter
  parseRequestsPerMinute?: number;
  // Behind Vercel's proxy the client IP is in X-Forwarded-For. Off locally, so it can't be spoofed.
  trustProxy?: boolean;
};

const sendParse = (res: express.Response, status: number, body: ParseResponse) =>
  res.status(status).json(body);

// The Express app without app.listen(), so tests and Vercel can import it directly.
export function createApp({
  extract = extractPayment,
  parseRequestsPerMinute = 30,
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
