# FlowPay — Progress log

Claude Code updates this file after every milestone. Read it first in every new session.

## Status

| Milestone | Status | Notes |
|---|---|---|
| M0 Scaffold | ✅ | Phone shows server status "ok" via Expo Go |
| M0.5 PhonePe spike + decision | 🟡 | Intent opens PhonePe prefilled ✅. Spike screen removed in M5; the payment matrix now runs through the real flow (Settings → DEV: tr switch + raw result). Still to do when the bank is back |
| M1 Amount parser | ✅ | 95 tests green. Your own family-phrase cases still welcome |
| M2 /parse + OpenRouter | ✅ | 142 tests green; live smoke 6/6 with `openai/gpt-4.1-nano` |
| M3 Phone pure logic + storage | ✅ | 167 new Jest tests (203 total) green |
| M4 Screens | ✅ | Phone check passed (fake launcher, no PhonePe yet) |
| M5 Real PhonePe | 🟡 | Built; 223 tests green. Phone checks up to the PIN screen pending; real ₹1 payment when the bank is back |
| M6 Wire together + voice | 🟡 | Built; 235 tests green; phone client → server → AI verified on the laptop. Phone check pending |
| M7 Same as last time + polish | ✅ | Server 152 + mobile 239 tests green; live smoke 8/8 incl. "pichhli baar jitna" |
| M8a Vercel | 🟡 | Code ready (zero-config, trust proxy, .vercelignore). You deploy: steps in docs/DEPLOY.md |
| M8b In-app mic | 🟡 | Code + config done (mic, voice Yes, eas.json). You build: docs/DEPLOY.md step 2 |
| M8c Release APK | 🟡 | Config done (package, permissions, UPI queries, preview profile). You build: docs/DEPLOY.md step 4 |

⬜ not started · 🟡 in progress · ✅ done · 🔴 blocked

## Known issues

- **App killed while PhonePe is open.** Android can kill FlowPay in the background (common on
  low-RAM phones), so the intent result never arrives. Mitigated from M5: a `pending` entry is
  written before launch and resolved on the next app start with "Did the payment go through?".
- **Expo Go SDK drift.** The project uses Expo SDK 57. When the Play Store's Expo Go moves to SDK 58
  (already on npm's `next` tag), it stops opening SDK 57 projects. Turn off auto-update for Expo Go;
  if it updates anyway, plan a deliberate `npx expo install expo@^58 --fix` session.
- **Daily limit history is local.** It lives in AsyncStorage, so clearing the app's data or
  reinstalling resets the ₹5,000/day count. Acceptable for a demo.
- **expo-intent-launcher ignores `packageName` on its own.** In its Android code (SDK 57) the
  package is only used together with `className`, so we can't target PhonePe by package name. The
  spike sends an implicit VIEW intent: Android opens the default UPI app or shows a chooser. M5
  must decide: keep the chooser (simple, user picks PhonePe) or target PhonePe's activity class
  (fragile, undocumented).
- **Use a non-reasoning model for /parse.** Reasoning ("thinking") models spend the 100-token
  budget on reasoning and return no JSON (`finish_reason: length`, content null) → `AI_FAILED`.
  `nvidia/nemotron-3-super-120b-a12b` did this, and it was also often `429 rate-limited upstream`.
- **In-app mic needs a build.** expo-speech-recognition isn't in Expo Go: there the mic button is hidden
  (keyboard mic instead). Since expo-dev-client is installed, `npx expo start` targets the development
  build; use `npm run start:go` for Expo Go.
- **Speech recognition uses the phone's speech service** (Google app). If it's missing or disabled, the
  mic shows "Didn't catch that"; typing and the keyboard mic still work. Audio never reaches our server.
- **npm audit in apps/mobile** reports moderate/high issues, all inside Expo's own build tooling
  (`@expo/config-plugins`, `@expo/prebuild-config` etc.) in a fresh SDK 57 template. Don't run
  `npm audit fix --force` (it breaks the SDK version pins); they go away with Expo patch updates
  (`npx expo install --fix`).

## Decisions

- mobile and server are separate npm projects (no workspaces).
- Amounts are always parsed by code, never by the AI.
- 2026-10-15 (Session 0 review):
  - **M0.5 PhonePe spike** right after M0: DEV-only screen, UPI ID and amount typed at runtime,
    raw result shown; ₹1/₹101/₹500 with and without `tr`, to a second account. A decision step
    picks a fallback before M4 if normal amounts fail.
  - **No NativeWind:** StyleSheet + `lib/theme.ts`.
  - **Tap-only confirm.** Voice "Yes" is an optional M8b stretch (strict match, mic only after TTS
    finishes). The confirm lock is persisted, keyed by txnRef.
  - **No payee files:** `payees.local.json`, `payees.example.json` and the postinstall script are
    dropped. Payees are added in Settings (SecureStore). The spoken name is matched against payee
    aliases first; contacts are only used for the "No UPI ID saved for X" message. Tests use
    fixtures in `lib/__tests__/fixtures.ts`.
  - **Pending before launch:** a `pending` history entry is written before the intent and resolved
    on app start. Pending counts toward the daily limit. `history.ts` moves from M7 to M3.
  - **Test payments go to a second account**, never to your own PhonePe account.
  - **/parse contract:** `{ ok: true, name, amount: { kind: "paise", paise } | { kind: "last" } }`,
    so "same as last time" (M7) needs no contract change. The AI copies `name` and `amountText`
    verbatim (same script); the server rejects either one if it isn't a substring of the
    normalized input.
  - **Amount parser scope:** Devanagari digits, rupaya/rupiya/rupees/rupay, the 11–99 words, lakh.
    A trailing "do" is always the verb "give" ("ek sau do" → ₹100; say ₹102 with digits).
    Devanagari number *words* are out of scope for now and fail safely.
  - **IST** is computed with a fixed UTC+05:30 offset, not `Intl` time zones.
  - **Unreadable history blocks payments** (2026-10-15, M3): if history can't be read, today's total
    is unknown, so `checkPayment` returns `HISTORY_UNREADABLE` until it's cleared in Settings
    (the unreadable data is kept in a backup key, never silently dropped).
  - **checkPayment takes the full history + now** and picks today's IST entries itself, so a screen
    can't pass the wrong day.
  - **Name matching:** exact name/alias or first word(s) ("Rahul" → "Rahul Verma"); more than one
    match is always a "Which …?" list; honorifics don't break ties; a surname alone doesn't match.
  - **Server is Vercel-ready from M0** (`export default app`, listen only when not on Vercel).
    M8a adds `trust proxy`. The real cost cap is the OpenRouter key's credit limit.

## Spike results (M0.5)

Fill in one row per attempt. **No UPI IDs or names here**, only the amount and what happened.
Payee = a second account (not the paying PhonePe account). Copy `resultCode` and `extra` from the
"Raw result" box on the spike screen (remove anything that looks like a UPI ID or account number).

| # | Amount | `tr` | PhonePe opened prefilled? | Paid? / error shown in PhonePe | `resultCode` | `extra` (raw, redacted) |
|---|---|---|---|---|---|---|
| 1 | ₹1 | yes | | | | |
| 2 | ₹1 | no | | | | |
| 3 | ₹101 | yes | | | | |
| 4 | ₹101 | no | | | | |
| 5 | ₹500 | yes | | | | |
| 6 | ₹500 | no | | | | |
| 7 | ₹1 | yes | | Pressed back on the PIN screen | | |

**Launch method (2026-10-15, Expo Go):** both `expo-intent-launcher` `startActivityAsync(VIEW)`
and `Linking.openURL` open PhonePe directly (no app chooser) on the payment screen with payee and
amount prefilled. The earlier "activity not found" launch error did not come back after the reload.
`startActivityAsync` is the one to use, because only it returns a result (`Linking` gives nothing back).

**Answers for the decision step**
- Do normal amounts (₹101/₹500) go through? →
- Does `extra` contain a `response` string (e.g. `Status=SUCCESS`)? →
- Did `tr` make any difference? →
- Fallback chosen (if any) →

## Log

<!-- Newest entry on top. Format:
### YYYY-MM-DD — Mx
- Built:
- How it was tested:
- Next step:
-->

### 2026-10-15 — M8b In-app mic + voice Yes, M8c release config
- Built:
  - `lib/voice.ts`: expo-speech-recognition wrapper (loaded with a guarded require, so Expo Go keeps
    working with the mic hidden). `listenOnce` with live partial results, final result / silence / error /
    10 s timeout, mic permission handling. Language toggle EN (en-IN) / हिं (hi-IN).
  - Home: "🎤 Tap and speak" fills the box live and goes to Next when you stop; Next stays as a button.
  - Confirm: voice "Yes" (strict, `lib/voiceYes.ts`): the mic opens only after the TTS question is done,
    listens once (6 s), and only a whole yes / yes send / haan / haan ji / haan bhejo / हाँ / हां (+ भेजो)
    counts. It calls the same locked Yes as the button. Anything else shows "tap Yes, send". CLAUDE.md
    rule 8 updated.
  - `app.json`: package `com.flowpay.demo`, versionCode 1, version 1.0.0; plugins expo-contacts (read only:
    WRITE_CONTACTS + legacy storage permissions blocked), expo-speech-recognition (permission texts,
    Google speech service), `plugins/withUpiQueries.js` (Android <queries> for upi://). Verified with
    `expo config --type introspect`: INTERNET, READ_CONTACTS, RECORD_AUDIO; WRITE_CONTACTS removed; upi
    query present.
  - `eas.json`: development (dev client, APK), preview (APK, EAS env "preview" for EXPO_PUBLIC_API_URL),
    production (AAB). New packages: expo-speech-recognition, expo-dev-client. `npm run start:go` for Expo Go.
  - Docs: `docs/DEPLOY.md` (Vercel, EAS builds, payment matrix, release APK), README rewritten,
    TEST-CHECKLIST + ARCHITECTURE updated.
- How it was tested: 265 Jest tests (26 new for voice Yes), typecheck clean, expo-doctor 21/21,
  Android bundle OK. The mic and the builds themselves need the phone (DEPLOY.md).

### 2026-10-15 — M8a Server ready for Vercel
- Built: `createApp({ trustProxy })`, on by default only when `VERCEL` is set, so express-rate-limit sees the
  real client IP behind Vercel's proxy (off locally, so X-Forwarded-For can't be spoofed to dodge the limit).
  `apps/server/.vercelignore` keeps `.env` (and tests/scripts) out of uploads. Vercel detects
  `src/app.ts`/`src/index.ts` (both default-export the app). No vercel.json needed.
- Note: the in-memory rate limit is per Vercel instance, so the real cost cap is the OpenRouter key's
  credit limit. Env vars to set on Vercel: OPENROUTER_API_KEY, OPENROUTER_MODEL (openai/gpt-4.1-nano).
- How it was tested: 154 Vitest (2 new: per-IP limit behind a proxy; X-Forwarded-For ignored without
  trustProxy); the default export is the Express app with trust proxy = 1 when VERCEL=1.

### 2026-10-15 — M7 Same as last time + history + share
- Built:
  - Server: the AI may answer `amountText: "LAST"`; it is accepted only if the text really contains a
    "same as last time" phrase (pichhli/pichli/pichhle baar, utna/utne hi, same as last time / before, last
    time, pehle jitna, पिछली बार, उतना ही, पहले जितना) → `{ kind: "last" }`, otherwise NO_AMOUNT. The
    name guard still applies. Prompt has the rule + an example.
  - Phone: `parseText` passes `kind: "last"` through; `flow.lastPaidAmount` = newest *successful*
    payment to that payee; none → "No previous payment to X found. How much do you want to send?". Works
    from the "Which X?" screen too. Rules still apply to the resolved amount.
  - All-payments screen (`app/history.tsx`, "See all payments" on Home), shared `PaymentRow`.
  - Receipt: "Share receipt" (status, amount, name, IST time, reference; no UPI ID).
  - Went through the "If something goes wrong" table; added the cases the app now handles.
- How it was tested: server 152 Vitest (11 new LAST cases), mobile 239 Jest (LAST resolution, rules on the
  resolved amount, lastPaidAmount); live smoke 8/8 against the real AI on a temporary port; typecheck +
  Android bundle clean.

### 2026-10-15 — M6 Wire together + voice (phone check pending)
- Built:
  - `lib/api.ts` `parseText`: POST /parse with only the text, 12 s timeout, Zod on the response
    (positive integer paise, non-empty name, known error codes). NO_NAME → "Who do you want to pay?",
    NO_AMOUNT → "How much do you want to send?", everything else (network, timeout, AI_FAILED, BAD_INPUT,
    unexpected body, no server URL) → "Couldn't understand that, please try again." `kind: "last"` → asks
    for the amount until M7.
  - Home uses the server instead of the fake parser (`lib/fakeParse.ts` deleted), shows "Understanding…",
    a keyboard-mic tip, max 300 characters.
  - Confirm speaks with expo-speech (en-IN): "Send 500 rupees to Mummy?", or the red-card reason (plain
    words, no ₹ sign). Speech stops on Yes or when leaving. Confirming stays tap-only.
  - Receipt: "Pay <name> <amount> again" → a new Confirm card (rules re-checked) with a new txnRef.
  - New package: expo-speech.
- How it was tested: 235 Jest tests (20 new for parseText, spokenRupees). Under Jest's RN environment
  fetch is not a real network call, so the end-to-end check ran the same `parseText` under Node against a
  temporary server on port 3999 + the real AI: Hinglish, Devanagari, "dedh hazaar", NO_AMOUNT, NO_NAME and
  server-down all correct.

### 2026-10-15 — M5 Real PhonePe (phone checks pending)
- Built:
  - `lib/upiLaunch.ts`: "Yes" now opens the UPI app with an implicit VIEW intent (`buildUpiUri`,
    note "FlowPay", `tr` = txnRef by default). Launch errors → "failed" (no app opened, no money moved).
  - `lib/upi.ts`: `extractUpiResponse` (extra.response, separate extras like Status/txnRef, or a
    response in `data`) and `statusFromLaunchResult` (resultCode is not trusted; only an explicit
    SUCCESS/FAILURE for this txnRef counts, everything else → "unknown").
  - `lib/pay.ts`: pending entry before launch, `paymentInFlight()` so recovery doesn't ask about a
    payment that's still open in PhonePe.
  - Receipt asks "Did the payment go through?" for pending/unknown entries and saves the answer.
  - Home, once per app start: the oldest still-pending payment opens its receipt with "FlowPay was
    closed while PhonePe was open."
  - Settings DEV: "Include tr" switch (in-memory, default on) and the last raw launch result.
  - Removed the M0.5 spike (`app/dev-upi.tsx`, `lib/devUpiSpike.ts`, its test, strings, Home link).
- How it was tested: 223 Jest tests (13 new for response extraction/status), typecheck clean,
  `expo export` bundles.
- Open: the real payment matrix (₹1 / ₹101 / ₹500, tr on/off) once the bank is back; then decide
  whether `tr` stays and whether a fallback is needed.

### 2026-10-15 — M4 Screens (phone check pending)
- Built:
  - Screens: Home (text input + Next, inline "No UPI ID saved for X" / "I don't know X yet" + Settings
    button, last 5 payments, server status, DEV spike link), Confirm (big amount, name, masked UPI ID,
    phone last 4; red card + no Yes on any rule failure; "already confirmed" when the txnRef lock is
    used), Choose ("Which X?"), Receipt (status, amount, name, IST time, txnRef), Settings (sent today,
    payees, "Clear unreadable history", DEV: seed ₹4,500 / clear fake / clear all), Payee edit
    (name, UPI ID, phone, aliases; delete).
  - Confirm never trusts params: it reloads the payee + history and runs `checkPayment` again.
  - "Yes" → persisted lock (`confirmLock`) → `sendPayment`: writes a `pending` entry, then the FAKE
    launcher returns "success" (no PhonePe yet), then the status is updated. M5 swaps the launcher.
  - Contacts (new SDK 57 API, `Contact.getAllDetails`) are only queried when no payee matches, and
    only decide the wording of the message.
  - Pure helpers with tests: `fakeParse`, `flow.resolvePayment`, `format`, `confirmLock`, history
    `clear` / `removeByTxnRefPrefix`. New package: expo-contacts.
- How it was tested: 241 Jest tests, typecheck clean, `expo export --platform android` bundles.
  The screens themselves still need the phone check (M4 Done list).

### 2026-10-15 — M3 Phone pure logic + storage
- Built (apps/mobile/lib):
  - `match.ts`: `normalizeName` (NFC, lowercase, punctuation, trailing honorifics ji/jee/bhaiya/
    bhai/didi/जी/भैया/दीदी dropped unless they're the whole name; mummy/mumma/mumy/mom/maa/मम्मी/माँ →
    "mummy", papa/pappa/dad/daddy/पापा → "papa"). `matchPayees` → one / many / none.
  - `phone.ts`: `normalizePhone` → `+91XXXXXXXXXX` (Indian mobiles 6–9) or null.
  - `rules.ts`: limits 300000 / 500000 paise, `istDayKey` (fixed +05:30), `sentTodayPaise`,
    `checkPayment` → NO_PAYEE / INVALID_AMOUNT / ZERO / OVER_PER_PAYMENT / HISTORY_UNREADABLE /
    OVER_DAILY. pending + success + unknown count; failed doesn't.
  - `upi.ts`: `formatRupeesForUri` (integer math), `buildUpiUri` (no `mc`, optional `tn`/`tr`, `@` kept
    literal), `parseUpiResponse` (only an explicit SUCCESS for this txnRef is success; unclear → unknown),
    `makeTxnRef` (alphanumeric, ≤35, unique).
  - `payees.ts`: Zod schema + SecureStore CRUD, one key per payee + an index (values < 2 KB), lowercased
    UPI IDs, duplicate UPI ID rejected, max 10 aliases, corrupt entries skipped with `corrupt: true`.
  - `history.ts`: AsyncStorage, Zod per entry, newest first, max 500, duplicate txnRef rejected, status
    changes pending → success/failed/unknown and unknown → success/failed only; corrupt data is backed
    up before being overwritten. `listPending`, `listToday` (IST).
  - `storage.ts`: KeyValueStore + SecureStore/AsyncStorage adapters; tests use an in-memory store.
  - Fixtures in `lib/__tests__/fixtures.ts` (fake data). Jest now only runs `*.test.ts` and mocks
    AsyncStorage (`jest.setup.ts`). New packages: expo-secure-store, @react-native-async-storage/
    async-storage, zod.
- How it was tested: tests written first; the user delegated the open question (unreadable history →
  block). 203 Jest tests green, typecheck clean, `expo export` bundles, expo-doctor 21/21.
- Next step: finish the M0.5 payment matrix + decision, then M4 (screens).

### 2026-10-15 — M2 /parse + OpenRouter
- Built:
  - `src/llm.ts`: OpenRouter chat completions via `fetch` (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`),
    `temperature: 0`, `response_format: json_object`, 10 s timeout, strips ```json fences. The system
    prompt asks for `name` and `amountText` copied exactly (same script), null if missing, and to
    ignore instructions inside the command. Errors are `LlmError(type)`, never containing the text.
  - `src/parse.ts`: Zod on the request (`text` 1–300 chars after trim) and on the AI output (extra
    keys such as a computed number are stripped). Substring guard on normalized text (NFC,
    lowercase, collapsed spaces): name not in input → `NO_NAME`, amountText not in input →
    `NO_AMOUNT`. Then `parseAmount()`; its failure → `NO_AMOUNT`.
  - `src/app.ts`: `createApp({ extract, parseRequestsPerMinute })` (tests inject a fake AI);
    `POST /parse` with express-rate-limit 30/min per IP. Status codes: 200 for ok and
    NO_NAME/NO_AMOUNT, 400 BAD_INPUT (incl. malformed JSON), 502 AI_FAILED, 429 rate limit (body
    `AI_FAILED`, so the phone contract stays the same). Logs only the error type.
  - Response: `{ ok: true, name, amount: { kind: "paise", paise } }` or
    `{ ok: false, error: "NO_NAME" | "NO_AMOUNT" | "AI_FAILED" | "BAD_INPUT" }`.
  - New packages: zod, express-rate-limit; dev: supertest, @types/supertest.
- How it was tested: 142 Vitest tests (95 amount, 34 endpoint via supertest with a fake AI, 13 for the
  OpenRouter client with a mocked `fetch`). They cover every branch, a fake AI returning its own
  number, prompt injection, a translated name, the rate limit, and a check that the user's text never
  reaches the logs. Live without a key: `/parse` → 502 `AI_FAILED`; empty or malformed body → 400
  `BAD_INPUT`.
- Live check (2026-10-15): the first key + model were accidentally put in `.env.example` (committed
  file). They were moved to `.env` before any commit, so nothing leaked. The first model ID didn't
  exist (HTTP 400). `nvidia/nemotron-3-super-120b-a12b` is a reasoning model and often rate-limited
  upstream (1/6). Compared on 10 phrases (incl. Devanagari, "Rahul bhaiya", prompt injection):
  `openai/gpt-4.1-nano` 10/10, median ~1.2 s; `qwen/qwen3-235b-a22b-2507` 9/10, up to 5.7 s.
  **Chosen: `openai/gpt-4.1-nano`** (~$0.10 per million input tokens). `npm run smoke` → 6/6.

**Live check:** with `npm run dev` running, `cd apps/server; npm run smoke` sends the 6 Done-list
phrases (incl. Devanagari) and prints PASS/FAIL. Without a key all 6 return `AI_FAILED` (verified).

**curl examples** (PowerShell: use `curl.exe`, server running with `npm run dev`):
```
curl.exe -s -X POST http://localhost:3000/parse -H "Content-Type: application/json" -d "{\"text\":\"Mummy ko paanch sau bhejo\"}"
# expected: {"ok":true,"name":"Mummy","amount":{"kind":"paise","paise":50000}}
curl.exe -s -X POST http://localhost:3000/parse -H "Content-Type: application/json" -d "{\"text\":\"kya haal hai\"}"
# expected: {"ok":false,"error":"NO_NAME"}
```

### 2026-10-15 — M1 Amount parser
- Built: `apps/server/src/amount.ts`, `parseAmount(text)` → `{ ok: true, paise } | { ok: false, reason }`.
  Integer paise only (every quantity is kept in paise, so 1.5 = 150; no floats). Tokenizes after
  NFC + lowercase, converts Devanagari digits, drops currency words (₹, rs, rupaye/rupaya/rupiya/
  rupees/rupay…), drops a trailing "do" (verb "give"). Number words 1–99 with ~200 Latin spellings,
  dedh/dhai, sawa/saadhe/paune prefixes, sau, hazaar/k, lakh. Indian grouping is checked (groups
  must get smaller, e.g. "hazaar lakh" fails). Strict: any unknown word, two amounts, a sign,
  more than 2 decimals, or zero → `ok: false`.
- How it was tested: tests written first and approved by the user. 95 Vitest cases green, typecheck
  clean, no spelling maps to two numbers. Extra probes: "sawa do sau" → ₹225, "paune sau" → ₹75,
  "do lakh paanch hazaar" → ₹2,05,000, "1k 500" → ₹1,500.
- Known edge: "hazaar sau" parses as ₹1,100 (people usually say "gyarah sau"); the confirm card shows
  the amount anyway.
- Next step: M2 (/parse + OpenRouter). Before M4: finish the M0.5 payment matrix + decision.

### 2026-10-15 — M0.5 PhonePe spike (partly tested)
- Phone results so far: after a reload, both Launch (`startActivityAsync`) and `Linking.openURL`
  open PhonePe directly on the payment screen, prefilled. The first attempt showed an "activity
  not found" launch error that did not come back after the reload, so diagnostics were added to
  the spike screen (open via Linking, `canOpenURL("upi://pay")`, open PhonePe home) plus the
  error code in the result box.
- Not done yet: no payment was approved (the user's bank was under maintenance), so the
  amount/`tr` matrix, the result extras and the decision step are still open. They must be done
  before M4. M1–M3 don't depend on them.

### 2026-10-15 — M0.5 PhonePe spike (code)
- Built: DEV-only `app/dev-upi.tsx` (redirects to Home when not `__DEV__`; linked from Home only in
  DEV). UPI ID, payee name and amount are typed at runtime and kept only in component state. A
  "Include tr" switch. It launches `expo-intent-launcher` `startActivityAsync(VIEW, { data,
  packageName: "com.phonepe.app" })` and shows the URI sent plus the raw result (`resultCode`,
  `data`, `extra`) or the launch error. Pure helpers in `lib/devUpiSpike.ts`: amount as a string
  validated with `^\d+(\.\d{2})?$` (no float math, capped at ₹500), `@` kept literal in `pa`,
  other values URL-encoded, `tr` = `FP` + timestamp + 6 digits. New package:
  `expo-intent-launcher` (~57.0.1, included in Expo Go).
- How it was tested: Jest 36/36 (31 new spike-helper tests), typecheck clean,
  `expo export --platform android` bundles. Phone matrix: see "Spike results".
- Next step: run the matrix on the phone, fill in "Spike results", then the decision step.

### 2026-10-15 — M0 Scaffold
- Built:
  - `apps/server`: Express 5 + TypeScript 5.9 (strict, ESM/NodeNext), `src/app.ts` (routes,
    `GET /health` → `{ ok: true }`) and `src/index.ts` (dotenv, `export default app`, listens on
    `0.0.0.0:PORT` only when `VERCEL` is unset). `npm run dev` (tsx watch), `npm test` (Vitest),
    `npm run typecheck`. TypeScript is pinned to 5.9 rather than 7.x because Vercel's Node builder
    uses the TypeScript JS API.
  - `apps/mobile`: `create-expo-app` default template (Expo SDK 57, RN 0.86, Expo Router), reduced to
    one Home screen (`app/index.tsx`) that calls `/health` at `EXPO_PUBLIC_API_URL` and shows the
    status with a "Check again" button. Template demo screens, components, web support and unused
    packages removed. `lib/strings.ts`, `lib/theme.ts`, `lib/api.ts` (`checkHealth`, 5 s timeout).
    Jest via `jest-expo`. App name "FlowPay", Android only.
  - Both `.env` files created from their examples (server key still empty; mobile points to the
    laptop's hotspot IP).
- How it was tested: server Vitest (`/health` over a real socket) and typecheck pass;
  `curl` to `localhost:3000/health` and `172.20.10.2:3000/health` → `{"ok":true}`. Mobile Jest
  (5 `checkHealth` tests) and typecheck pass; `expo-doctor` 21/21; `expo export --platform android`
  bundles cleanly. Phone check (by the user): Expo Go on the Android phone, same iPhone hotspot,
  opened `exp://172.20.10.2:8081`; the app loaded and connected to the laptop server.
- Next step: M0.5 PhonePe spike.

### 2026-10-15 — Session 0 review (docs only)
- Built: no code. Reviewed the plan, verified the setup, and applied the decisions above to
  CLAUDE.md, README.md, ARCHITECTURE.md, PROMPTS.md, TEST-CHECKLIST.md and this file. Removed
  `apps/mobile/payees.example.json`.
- How it was tested: `git check-ignore` confirms `apps/server/.env`, `apps/mobile/.env` and
  `apps/mobile/payees.local.json` are ignored.
- Next step: M0 (scaffold), then the M0.5 PhonePe spike.
