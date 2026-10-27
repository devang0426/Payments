# FlowPay — Progress log

Claude Code updates this file after every milestone. Read it first in every new session.

## Status

| Milestone | Status | Notes |
|---|---|---|
| M0 Scaffold | ✅ | Phone shows server status "ok" via Expo Go |
| M0.5 PhonePe spike + decision | ✅ | Payment test 2026-10-16: ₹1, ₹101, ₹500 (tr on) all paid, receipt "Done" on its own. No fallback; `tr` stays on |
| M1 Amount parser | ✅ | 95 tests green. Your own family-phrase cases still welcome |
| M2 /parse + OpenRouter | ✅ | 142 tests green; live smoke 6/6 with `openai/gpt-4.1-nano` |
| M3 Phone pure logic + storage | ✅ | 167 new Jest tests (203 total) green |
| M4 Screens | ✅ | Phone check passed (fake launcher, no PhonePe yet) |
| M5 Real PhonePe | 🟡 | Real payments ✅ (₹1/₹101/₹500, status read from PhonePe). Still to check: back on the PIN screen, double tap, kill FlowPay while PhonePe is open |
| M6 Wire together + voice | 🟡 | Built; 235 tests green; phone client → server → AI verified on the laptop. Phone check pending |
| M7 Same as last time + polish | ✅ | Server 152 + mobile 239 tests green; live smoke 8/8 incl. "pichhli baar jitna" |
| M8a Vercel | 🟡 | Code ready (zero-config, trust proxy, .vercelignore). You deploy: steps in docs/DEPLOY.md |
| M8b In-app mic | 🟡 | Code + config done (mic, voice Yes, eas.json). You build: docs/DEPLOY.md step 2 |
| M8c Release APK | 🟡 | Config done (package, permissions, UPI queries, preview profile). You build: docs/DEPLOY.md step 4 |
| Payment test | ✅ | 2026-10-16, see "Spike results" |
| M9 Demo-day reliability | 🟡 | Built; server 160 + mobile 306 tests green. Phone check pending (M9 Done list) |
| M10 Protect payees | ✅ | Built 2026-10-16; mobile 367 tests green; phone check passed (user) |
| M12 Conversation + voice confirm | 🟡 | Built 2026-10-16: server 215 + mobile 475 tests green, live eval 37/37 (gate PASS). Phone check pending; voice parts need the development build |
| M11 Hindi end to end | 🟡 | Built 2026-10-16: server 269 + mobile 549 tests green, live eval 45/45 + smoke 10/10. Phone check pending (user tests at the end) |
| Theme from FlowPay.html | 🟡 | Built 2026-10-19: look only (colours, font, buttons, cards); screens and flow unchanged. Mobile 549 tests green. Phone check pending |
| M13 On-phone abilities | 🟡 | Built 2026-10-19: server 393 + mobile 732 tests green, live eval 70/70 (GATE PASS) + smoke 10/10. Phone check pending; reminders need a new development build (or Expo Go) |
| M16 Voice-only Home | 🟡 | Built 2026-10-19 (docs/VOICE-PLAN.md): big mic, auto-listen, spoken results. New UI seen on the phone (user); voice steps deferred by the user (test later, together with M17) |
| M17 Helper + proactive | 🟡 | Built 2026-10-19: family helper ("Call Beta"), reminder → Home asks at once, monthly suggestion; mobile 794 tests green. Phone check pending |
| M14 Tool-calling agent | 🟡 | Built 2026-10-19: POST /agent, several payments per message (queue), server 457 + mobile 828 tests green; live /agent eval 84/86 (GATE PASS), /turn 70/70, smoke 10/10; model stays gpt-4.1-nano. Phone check pending; Vercel needs a redeploy | Stateless agent, eval-based model choice |
| M15 Memory + explanations | 🟡 | Built 2026-10-19: preferences, nicknames (fingerprint/PIN), "Kyun block hua?"; server 479 + mobile 872 tests green; live /agent eval 91/92 (GATE PASS). Phone check pending |
| Polish (rough edges) | 🟡 | Built 2026-10-19: see the log entry. Phone check pending (docs/CHECKLIST.md) |
| One spoken yes | 🟡 | Built 2026-10-22 (user's choice): recognizer spellings of yes, "not clear" asks once more aloud, 8 s window, first payment = one yes; mobile 930 tests green. Phone check pending (CHECKLIST 2.6a–d) |
| Stabilise (QA review) | 🟡 | Built 2026-10-22: LLM timeout 6 s, Confirm/Home never hang on a storage error, stalled launch → unknown, spoken phone numbers blocked, WRITE_CONTACTS cleanup; server 480 + mobile 947 tests green. Phone check pending ("Don't keep activities" test) |
| Add payee by QR scan | 🟡 | Built 2026-10-22: `parseUpiQr` (tests first, approved), `expo-camera`, scan screen; mobile 893 tests green. New development build with the camera made 2026-10-22 (EAS build `65676cae`); install it, then phone check (CHECKLIST §13) |

⬜ not started · 🟡 in progress · ✅ done · ⏸ paused · 🔴 blocked

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
  package is only used together with `className`, so we can't target PhonePe by package name.
  Decided in M5: an implicit VIEW intent (Android opens the default UPI app or shows a chooser);
  targeting PhonePe's activity class was rejected as fragile and undocumented. On a phone with
  several UPI apps, pick PhonePe + "Always" once before the demo.
- **ESLint isn't set up.** `npm run lint` (`expo lint`) installs `eslint` + `eslint-config-expo` and
  rewrites the lockfile on first run, so don't run it casually; adding ESLint is a separate decision.
  A one-off run in M9 (then reverted) found three errors from the React Compiler rules in older
  screens: `Date.now()` during render in `choose.tsx` and `history.tsx`, and `yesRef.current = yes` in
  `confirm.tsx`. Tests and typecheck are unaffected. Fix them when those screens are next touched (M12
  rewrites the Confirm voice logic).
- **Use a non-reasoning model for /parse.** Reasoning ("thinking") models spend the 100-token
  budget on reasoning and return no JSON (`finish_reason: length`, content null) → `AI_FAILED`.
  `nvidia/nemotron-3-super-120b-a12b` did this, and it was also often `429 rate-limited upstream`.
- **In-app mic needs a build.** expo-speech-recognition isn't in Expo Go: there the mic button is hidden
  (keyboard mic instead). Since expo-dev-client is installed, `npx expo start` targets the development
  build; use `npm run start:go` for Expo Go.
- **Speech recognition uses the phone's speech service** (Google app). If it's missing or disabled, the
  mic shows "Didn't catch that"; typing and the keyboard mic still work. Audio never reaches our server.
- **Reminders need notifications in the build.** `expo-notifications` (M13) is a native module: a
  development build made before M13 doesn't have it, and saving a reminder there says "not available"
  (nothing crashes). Build again (DEPLOY.md step 2). Local notifications also work in Expo Go on
  Android. Delivery is "best effort" (no exact-alarm permission): Android may ring a few minutes late.
- **A reminder that rings while you ignore it** stays in Settings → Reminders: a one-time one for 7 days
  (so a late tap still opens it), a monthly one moves to next month on the next app start.
- **The model sometimes copies a period in the other script** ("इस महीने" → "is mahine"). The span check
  rejects that, so code reads the period from the user's own words instead (`findPeriodIn`).
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
    Devanagari number *words* are out of scope for now and fail safely. (Superseded by M11, 2026-10-16:
    Devanagari number words are read like the Latin ones.)
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
- 2026-10-16 (planning, docs only):
  - **Plan after M8:** payment test → M9 → M10 → M12 → M11 → M13 → M14 → M15 (prompts in
    `docs/PROMPTS.md`, agent design in `docs/AGENT.md`).
  - **Agent architecture:** router first (one LLM call per turn, one action, spans only), then a
    stateless tool-calling agent; the phone keeps the conversation and runs the tools. Display-only
    tools keep rule 3 unchanged. Rejected: server-side tools over payment history and server-pushed
    family alerts (rule 3), a thin LLM proxy (open proxy on our key), server sessions (Vercel), and a
    Swiggy MCP (off-mission).
  - **Rule 8 changes in M12: a spoken yes confirms.** Strict list yes / yes please / yes send /
    yes send it / haan / haan ji / haanji / haan bhejo / haan bhej do / ok bhejo / हाँ / हाँ जी /
    हाँ भेजो / हाँ भेज दो; a yes + change is compared with the card in code (same payee + paise →
    confirm, different → new card + new txnRef, same without yes → re-ask, max 2, then "Please tap
    Yes to send"); cancel phrases (nahi, cancel, nahi bhejo, mat bhejo, cancel karo, rehne do, chhodo
    + Devanagari) → "Cancelled" and the card closes; "ruko" / "wait" alone → pause (mic closes, card
    stays, "Okay, tap the mic when you're ready."); 5 s window; mic after TTS; no confirm on red;
    amber needs a second yes; tap stays as a fallback. Full spec + 45 test cases in `docs/AGENT.md`.
    Until M12, the M8b behaviour applies.
  - Negations veto any confirm. "na" is a negation only alone or before a verb ("na bhejo"); a
    trailing "na" is a softener ("haan bhejo na" confirms).
  - Added by Claude: the yes-word must be the first word; TTS echo filter; a hard 5 s cutoff (late
    results ignored); the amber second yes must be on the strict list; "no" and "na" alone also
    cancel; spelling variants nahin bhejo / rahne do / chodo / छोडो; a mic button on the Confirm
    card (needed for "tap the mic").
- 2026-10-19 (theme): `FlowPay.html` (repo root) is the **visual theme only**: colours, Atkinson
  Hyperlegible, pill buttons, white cards. The app's screens, navigation, wording and behaviour stay as
  built; its six mock-up screens are not a flow change. A first full redesign (new Listening / Opening
  PhonePe / Over limit views, Pay/History tabs) was rolled back at the user's request.

## Spike results (M0.5)

Fill in one row per attempt. **No UPI IDs or names here**, only the amount and what happened.
Payee = a second account (not the paying PhonePe account). Copy `resultCode` and `extra` from the
"Raw result" box on the spike screen (remove anything that looks like a UPI ID or account number).

| # | Amount | `tr` | PhonePe opened prefilled? | Paid? / error shown in PhonePe | `resultCode` | `extra` (raw, redacted) |
|---|---|---|---|---|---|---|
| 1 | ₹1 | yes | yes | Paid; receipt "Done" on its own | not recorded | not recorded |
| 2 | ₹1 | no | not tested | | | |
| 3 | ₹101 | yes | yes | Paid; receipt "Done" on its own | not recorded | not recorded |
| 4 | ₹101 | no | not tested | | | |
| 5 | ₹500 | yes | yes | Paid; receipt "Done" on its own | not recorded | not recorded |
| 6 | ₹500 | no | not tested | | | |
| 7 | ₹1 | yes | not tested yet | Pressed back on the PIN screen | | |

Run 2026-10-16 through the real flow (not the old spike screen), as reported by the user.
"Done on its own" means `statusFromLaunchResult` found an explicit SUCCESS for our txnRef in
PhonePe's result.

**Launch method (2026-10-15, Expo Go):** both `expo-intent-launcher` `startActivityAsync(VIEW)`
and `Linking.openURL` open PhonePe directly (no app chooser) on the payment screen with payee and
amount prefilled. The earlier "activity not found" launch error did not come back after the reload.
`startActivityAsync` is the one to use, because only it returns a result (`Linking` gives nothing back).

**Answers for the decision step**
- Do normal amounts (₹101/₹500) go through? → **Yes** (with `tr`).
- Does `extra` contain a `response` string (e.g. `Status=SUCCESS`)? → **Yes, a status comes back**
  (the receipt marked the payments "Done" without asking).
- Did `tr` make any difference? → Not tested; `tr` stays **on** (the tested setting).
- Fallback chosen (if any) → **None needed.**

## Log

<!-- Newest entry on top. Format:
### YYYY-MM-DD — Mx
- Built:
- How it was tested:
- Next step:
-->

### 2026-10-22 — Stabilise (QA review findings 4, 7, 8, 10, 12; phone check pending)
- Why: the QA review (claude.ai doc "FlowPay — QA Review & Make-It-Real Plan") found edge cases that
  could hang a screen, waste LLM calls, or let a spoken phone number reach the server.
- Built:
  - **Server LLM timeout 10 s → 6 s** (`LLM_TIMEOUT_MS`, `src/llm.ts`): the phone gives up after 7 s per
    attempt and retries only when no answer came, so a 7–10 s LLM answer used to be thrown away and paid
    for twice. Now the server answers "failed" first (rule 9 unchanged). docs/AGENT.md limits updated.
  - **Confirm card can't hang on "loading"**: a storage error while reading payees / history / the lock
    → new `loadFailed` state ("Couldn't read your saved payees or payments. Nothing was sent…").
    Home's app-start recovery check (`listPending`) catches too and greets anyway.
  - **A launch that never returns** (`lib/pay.ts` + new `lib/launchStall.ts`): if FlowPay comes back
    to the screen and no UPI result arrives within 15 s (Android recreated FlowPay while PhonePe was
    open), the payment becomes `unknown` (counts toward the limit; the receipt asks "Did it go
    through?") instead of "Sending" forever. A result that still arrives later is saved; a late launch
    error is not (PhonePe was open, so it proves nothing).
  - **Spoken phone numbers** (`lib/prefilter.ts`): 10+ digits in a row with at least one digit word
    (Latin, Hinglish, Devanagari; "double"/"triple") → `phone`, never sent (rule 3). "no" is not a digit
    word (cancel word); "do" is (only a run of 10 counts).
  - `app.json`: `WRITE_CONTACTS` removed from `permissions` (it was also in `blockedPermissions`).
  - Not code: `OPENROUTER_FALLBACK_MODEL` is still to be set by the user (DEPLOY.md step 1), then
    `npm run eval` against it once.
- How it was tested: server 480 Vitest (+1), mobile 947 Jest (+5 stall, +12 spoken-number), typecheck
  clean in both, Android bundle OK. Built on top of the uncommitted "One spoken yes" changes.
- Next step: phone check: Developer options → "Don't keep activities" on, pay ₹1, come back from
  PhonePe → within ~15 s the receipt asks "Did it go through?" (then switch the option off). Then
  plan step 2 (voice on "Which Mummy?" and "Did it go through?").

### 2026-10-22 — One spoken yes is enough (phone check pending)
- Why: on the phone the user had to say yes "again and again" before a payment went through. Causes:
  the recognizer's spellings ("han", "okay", "theek hai") weren't on the strict list → "not clear" with
  the mic closed; every first payment to a payee was amber (second yes); a 5 s window.
- Built (the user picked all four options; rule 8 text in CLAUDE.md and docs/AGENT.md "Voice
  confirmation changes, 2026-10-22" updated):
  - `lib/voiceConfirm.ts`: STRICT_YES + 37 phrases (recognizer spellings and plain yeses, Latin and
    Devanagari), more yes-words for "yes + change"; `LISTEN_WINDOW_MS` 5000 → 8000; `MAX_NOT_CLEAR_ASKS`
    = 1. Still: the whole utterance, no no-word in any phrase (tested), negations veto, echo / late /
    stale ignored, never on red. The reminder card and the helper offer use the same list and window.
  - `app/confirm.tsx`: "not clear" → says "Sorry, I didn't catch that. Say haan to send it, or nahi to
    stop it." (Hindi too) and opens the mic once more per card; then hint + tap only.
  - `lib/rules.ts cardTone` (money/safety file: tests shown to and approved by the user first): amber
    only for UNUSUAL_AMOUNT or LATE_NIGHT; FIRST_PAYMENT alone → green, still spoken and shown as a note
    on the card; the ₹500 / 24 h new-payee limit is unchanged.
  - Tests that pinned the old list/window updated on purpose (#6, #28/#29, "ok"/"haan haan"/"yes yes" now
    confirm, the answer-word checks now use the whole yes list); eval v11 → 8.3 s, v15 → "haan ok",
    new v15b–d.
- How it was tested: mobile 930 Jest (+37), typecheck clean, Android bundle OK. Live (gpt-4.1-nano,
  port 3999): /agent 94/95 (99%, GATE PASS; voice 15/15, voiceGuard 17/17, refuseAsk + prefilter 100%),
  /turn 73/73, smoke 10/10, server log clean. The miss: "500 bhejo" came back as set_amount instead of
  pay; the phone then asks "Who do you want to pay?", the same as for pay (harmless).
- Next step: phone check (CHECKLIST 2.6a–d). JS only: no rebuild.

### 2026-10-22 — Add a payee by scanning their UPI QR (phone check pending)
- Why: typing UPI IDs by hand is the most error-prone part of setting up her payees (doodhwala, kamwali…).
- Built:
  - `parseUpiQr` in `lib/upi.ts` (money/safety file: **tests first**, `lib/__tests__/upiQr.test.ts`,
    shown to and approved by the user): a `upi://pay?…` QR (or a bare UPI ID) → the UPI ID (decoded,
    trimmed, lower-cased, `VPA_PATTERN`) + a suggested name (`pn`, cleaned, ≤ 50) + "shop" flag (`mc`).
    **Any amount, note or reference in the QR is ignored**; refused: web links, text, Bharat/EMV
    codes, `upi://mandate`, no / invalid UPI ID, two different UPI IDs, > 1000 characters. Never throws.
  - **New package `expo-camera` ~57.0.6** (explained and approved first): QR scanning built in. Config
    plugin in `app.json` (`CAMERA` permission with a plain message, `recordAudioAndroid: false`).
    `lib/camera.ts` loads it optionally, so a build without it says "not available" instead of crashing.
  - `app/scan-qr.tsx`: camera permission → scan → the first valid UPI QR goes back to the form
    (`stores.qrHandoff`, memory only, taken once); an invalid QR says why and keeps scanning.
  - Settings → Add / Edit payee: **"📷 Scan UPI QR code"** fills the UPI ID, and the name only if none is
    typed; a note says to check both (the QR's name is chosen by its owner), "shop QR", and in edit mode
    that a new UPI ID restarts the ₹500 / 24 h limit. Saving still needs the fingerprint/PIN; a QR never pays
    (rule 6 unchanged: only saved payees can be paid).
  - Privacy: nothing the camera sees is stored, logged or sent; the QR never reaches the server or the AI.
  - Same day, on request: **Home → "📷 Add payee (QR)"** (a small link in Home's bottom row, so the
    big-mic screen stays simple for her) → scanner → the Add payee form opens already filled
    (`scan-qr?then=add` → `router.replace("/payee-edit")`) → Save with fingerprint/PIN → back to Home.
- How it was tested: mobile 893 Jest (+21 QR tests), typecheck clean, Android bundle OK.
- Known: `npx expo install --check` reports `expo` 57.0.29 → 57.0.31 and `expo-router` 57.0.27 → 57.0.29
  (patch releases since setup; not from this change). Optional: `npx expo install --fix` in its own step.
- **Next step: rebuild the development build** (DEPLOY.md step 2; `expo-camera` is native). Until then
  the scan button says "not available" in the old build; it works in Expo Go already. Then CHECKLIST §13.

### 2026-10-19 — Polish + M15 Memory and explanations (phone check pending)
- Why: the user asked to "build the whole application first" and test everything later; one ordered
  checklist for that session: **docs/CHECKLIST.md**.
- Polish (rough edges from the review):
  - "Cancelled" on the Confirm card is spoken to the end (the card's cleanup no longer stops it).
  - Several payments: Home waits until the receipt has finished speaking before the next card opens.
  - "How much should I send to Papa?" (Home, queue, reminders); the server still sees the plain question.
  - "Papa ko kitna bheja?" read by the model as "show recent" → code makes it the total (no "dikhao").
  - Ready check: new rows **Notifications allowed** and **Family helper saved**.
  - Lint issues from M9 fixed: History's `Date.now()` during render, Confirm's `yesRef` set during render.
    (choose.tsx's `Date.now()` is inside a tap handler, not render: left as is.)
  - Not done on purpose: the home-screen shortcut (Home already listens on open; it would need a new
    package and a rebuild); Hindi screen text (still the user's decision).
- M15 (docs/AGENT.md "M15 as built"): tools `set_preference`, `suggest_alias`, `explain_last`;
  `lib/preferences.ts` (reply language, speak replies; Settings → Voice), `lib/alias.ts` +
  `app/alias.tsx` (nickname card → fingerprint/PIN → checked again → saved; never a name that reaches
  another payee), `lib/explain.ts` ("Kyun block hua?" from the phone's last outcome, 10 min, EN + HI),
  the conversation dropped after 10 min idle.
- Found by the live eval and fixed in code: "…meri daily limit 50000 kar do" came back as a language
  preference → a preference now changes only when her words name it; a display next to a payment card
  → dropped; a spending period copied from the prompt's examples → /agent uses the period in her words
  (/turn keeps its M13 rule).
- How it was tested: server 479 Vitest (+22), mobile 872 Jest (+44: `m15.test.ts`, Ready check rows,
  spoken lines), typecheck clean in both, Android bundle OK. Live (gpt-4.1-nano, port 3999): /agent
  91/92 (99%, GATE PASS; refuseAsk, voiceGuard, prefilter, m15 all 100%; 54/57 turns in 1 step; p50
  1.17 s, p95 1.61 s), /turn 70/70, smoke 10/10, server log clean. The miss: "Sharma ji saved hain
  kya?" → "not understood" (safe).
- Next step: the user's test session, **docs/CHECKLIST.md** top to bottom; redeploy Vercel; release APK.

### 2026-10-19 — M14 Tool-calling agent (phone check pending)
- Built (details and deviations: docs/AGENT.md "M14 as built"):
  - **Server** `POST /agent` (`src/agent.ts`, tools + prompt in `src/tools.ts`, `callAgent` in
    `llm.ts`): one LLM call per request with 10 tools; every call checked by `checkAiTurn` (the /turn
    checks, split out of `runTurn`, behaviour unchanged). No free text ever reaches the phone (fixed
    `tell_user` ids only). find_payee is the only tool the phone runs between steps (it answers
    `{ match, count }`). Limits: ≤ 4 steps, ≤ 6 calls, ≤ 3 payments per turn, 200 tokens, 10 s, 30/min.
  - **Several payments in one message**: split per name, each amount from its own part; the phone
    opens one card at a time (`stores.paymentQueue`), each with its own txnRef and yes. A spoken
    "nahi" on a card clears the rest.
  - **Phone** `lib/agent.ts` (step loop, 20 s per turn; `planActions`), `sendAgent` in `api.ts` (Zod;
    pre-filter backstop), Home uses /agent (the Confirm card keeps /turn); new displays "Left for
    today" and "Last payments"; spoken + Hindi templates for every fixed message; DEV "Agent steps" line.
  - Found live and fixed in code (with tests): change_draft + prepare_payment for one correction gave
    **two identical cards** → merged into one; several display tools → the first; a display repeated
    from an earlier message → dropped next to a valid payment; the same action twice → once;
    `provider.require_parameters` + `parallel_tool_calls` → OpenRouter 404 (removed). Prompt: worked
    examples + "copy spans from the user, never from the examples" (the model copied "is mahine" for
    "pichhle mahine"; the span check had caught it).
  - `scripts/eval.ts --agent` + `scripts/evals/agent.json` (22 cases: several payments, new tools,
    refusals, the example conversations); Confirm-card turn cases are skipped there (they use /turn).
    `scripts/agent-debug.ts` prints the raw tool calls for test sentences (fake data only).
- **Model comparison** (same eval, /agent, 86 cases; prompt as of the comparison):

  | Model | Pass | refuseAsk | p50 | p95 | Gate |
  |---|---|---|---|---|---|
  | `openai/gpt-4.1-nano` | 83/86 (97%) | 10/10 | 1.09 s | 1.69 s | PASS |
  | `openai/gpt-4.1-mini` | 84/86 (98%) | 9/10 | 1.26 s | 1.98 s | fail |
  | `qwen/qwen3-235b-a22b-2507` | 78/86 (91%) | 8/10 | 2.40 s | 5.95 s | fail |
  | `mistralai/mistral-small-3.2-24b-instruct` | 84/86 (98%) | 9/10 | 1.44 s | 2.22 s | fail |

  The refuseAsk misses of mini and mistral were safe answers (two refusals + ask; ask twice), now
  handled (eval alternative / dedupe). **Chosen: gpt-4.1-nano** (gate, fastest, cheapest). Cost:
  ~2,700 input + ~60 output tokens per request → ~$0.0003 per request, **~$0.03 per 100 requests**
  (estimate from prompt size; mini would be ~4×).
- **Final run on the shipped code (nano, port 3999):** /agent 84/86 (98%, GATE PASS; refuseAsk,
  voiceGuard, prefilter 100%; 49/51 user turns in 1 LLM step, max 2; p50 1.17 s, p95 1.72 s), /turn
  70/70, smoke 10/10. Server log: only `agent: step=… tools=… ms=… -> …` lines. The 2 misses are
  safe: "Papa ko kitna bheja?" showed recent payments instead of a total; "Sharma ji saved hain
  kya?" → "not understood".
- How it was tested: server 457 Vitest (+64: `agent.test.ts` incl. hostile output, `callAgent`),
  mobile 828 Jest (+34: `agent.test.ts` incl. a 500-case property test, `agentApi.test.ts`, new spoken
  lines), typecheck clean in both, Android bundle OK.
- Not done: tools `check_upi_id` (the pre-filter covers it), `list_reminders` / `cancel_reminder`
  (Settings); M15 tools.
- **Vercel: deploy again** (DEPLOY.md, step 1 note) before using the release app; the old deployment
  has no /agent.
- Next step: phone check (TEST-CHECKLIST "Voice-first Home, helper, agent"), together with M16/M17;
  then M15.

### 2026-10-19 — M17 Helper + proactive (phone check pending)
- Built (docs/VOICE-PLAN.md Phase 3):
  - **Family helper** (`lib/helper.ts`): one trusted person, name + Indian mobile number (normalized
    by `phone.ts`), SecureStore + Zod, on the phone only (rule 3: never sent). Settings → Family
    helper: add / change / remove; saving and removing need the fingerprint/PIN (`deviceAuth`, like a
    payee); no screen lock = no change. `components/CallHelper.tsx`: "📞 Call <name>" opens the dialer
    (`tel:`, no call permission; she still presses call).
  - Where it shows: the Confirm **red card**; **Home when it goes quiet** (second silence or second
    failed request). After the second *failed request* Home also asks "Should I call Beta?" and listens
    once (5 s); `decideHelpVoice` (code): strict yes → dialer; cancel phrase or a no-word without a
    yes → nothing; late / echo / silence ignored; anything else → nothing. Silence alone never speaks
    the offer (she may just have walked away).
  - **Reminder → Home asks at once**: a tapped reminder without an amount used to set the
    conversation silently; now `conversation.openFromOutside` tells Home, which (if already on screen)
    stops listening and asks "How much…?" by voice. Reminders with an amount open the Confirm card as
    before (it speaks and listens).
  - **Monthly suggestion** (`suggestMonthlyReminder` in `reminders.ts`): after the 2nd Done payment of
    the same amount to the same payee (rehearsals never count; none if that payee has a reminder;
    days 1–28 IST), the receipt offers "🔔 Remind me every month on the 19th" → the reminder card
    (which still asks for the yes).
- How it was tested: mobile 794 Jest (+50: `helper.test.ts`, `suggestMonthlyReminder`), typecheck
  clean, Android bundle OK. No new package; JS only, so no new build needed.
- Not done: the optional "Beta ko batayein?" WhatsApp share (the receipt's Share button covers it).
- Next step: phone check (below), then M14.

**M17 phone check** (development build, `npx expo start`):
1. Settings → Family helper → Add: your name + number → Save → fingerprint/PIN. Cancel the
   fingerprint once: nothing is saved.
2. Home: say something it can't understand twice (or turn off the laptop server) → it asks "Should I
   call …?" → say "haan" → the dialer opens with your number. Try again and say "nahi": nothing opens.
3. Stay silent twice: the "📞 Call …" button shows, nothing is spoken.
4. Ask for ₹4,000 → red card → "📞 Call …" is there.
5. Pay the same payee the same amount twice (rehearsal doesn't count) → the receipt offers "Remind me
   every month on the …".

### 2026-10-19 — M16 Voice-only Home (phone check pending)
- Why: on the first development build the user found the app "not agentic" (in Expo Go there is no
  in-app mic, so everything had to be typed) and asked for a voice-only app for their mother. Plan in
  `docs/VOICE-PLAN.md` (agreed 2026-10-19). Defaults used: screen text stays English; the mic opens
  by itself.
- Built:
  - **Home** (`app/index.tsx`): one big round mic (pulses while listening), the question in big text,
    her words under it. Home speaks its question and opens the mic **every time it is shown** (after
    the pending-payment check on app start). Silence or a failed request (rule 9 text still shown): one
    spoken nudge + one more listen, then quiet until a tap (`lib/voiceFlow.ts`). Tapping the mic while
    it listens stops it without a nudge. The chat bubbles and recent payments are gone from Home;
    "Type instead", "Payments", "Start over" are small links; Settings is a ⚙ at the top; the server
    line only shows when it's not ok. Expo Go: the text box is shown as before.
  - Home also **speaks** "I don't know X yet…" and "No UPI ID saved for X" (before: shown only).
  - Mic waits out longer pauses on Home (`listenOnce({ patient: true })`: Android silence extras
    2.5 s / 2 s; some speech services ignore them). Home window 10 s; the Confirm card stays 5 s (rule 8).
  - **Confirm**: amount 56 pt, name 32 pt, the payee's initial in a circle; after "Yes" one clear
    "Opening PhonePe… Approve the payment in PhonePe with your fingerprint or UPI PIN." step.
  - **Receipt**: big ✓ / ✕ / ?, and the result is spoken: "Done. 600 rupees sent to Ramesh." /
    "The payment didn't go through." / "PhonePe couldn't be opened…" / "Did the payment go
    through? Please tap a button." Rehearsal adds "No money moved". Hindi for all of it.
  - Not changed: rules, locks, voice confirmation, Choose, Settings, the server.
- How it was tested: mobile 744 Jest (+12 in `voiceFlow.test.ts`: greeting, one nudge then quiet,
  receipt lines, no line ends with a yes/cancel word, the nudge has no amount), typecheck clean,
  Android bundle OK.
- Not done: Android home-screen shortcut "Paise bhejo" (needs a package + a new build); Phase 0 (the
  user's list of UI problems) still to come.
- Next step: phone check on the development build (`npx expo start`; no rebuild needed, JS only), then
  Phase 1 on her phone, then M17.

### 2026-10-19 — M13 On-phone abilities (phone check pending)
- Built (tests first, shown to the user and approved with the listed decisions):
  - **Pre-filter** (`lib/prefilter.ts`): anything with an `@` (UPI ID, email) or an Indian mobile
    number (+91/0/spaces/dashes, Devanagari digits) is never sent. Home answers "I can only pay saved
    payees…" (spoken); a UPI ID gets "Check this UPI ID" → `app/upi-check.tsx`: saved as X since …,
    when the ID was set, format, common/unfamiliar handle, then always "Only PhonePe's bank-registered
    name can confirm the owner." No verdict words (tested). `api.ts` refuses to send any such user turn
    as a backstop (`blocked: true`), for `/turn` and `/parse`.
  - **show_spending**: `/turn` takes `periodText`; `when.ts parsePeriod` (aaj, kal = yesterday, is
    hafte, is mahine, pichhle mahine + Devanagari; none said = all time). The phone (`lib/spending.ts`)
    works out the IST range (weeks from Monday) and adds up only Done payments ("+N not confirmed" for
    pending/unknown). The total is shown and spoken by the phone and never added to the conversation.
    Several matching payees → one line each.
  - **Reminders**: `expo-notifications@57.0.23` (SDK 57; local notifications only, explained before
    installing; adds POST_NOTIFICATIONS + RECEIVE_BOOT_COMPLETED, no exact alarm). `/turn` takes
    `whenText`; `when.ts parseWhen` (kal = tomorrow, parson, "1 tareekh", "1st", "pehli tareekh",
    "har mahine 1 ko" (days 1–28), Devanagari). `lib/reminders.ts`: always 9:00 AM IST, skips months
    without the day, store (AsyncStorage + Zod, max 20, payeeId + paise + when only), catch-up on app
    start. Reminder card `app/reminder.tsx`: spoken question, strict yes or Save (no changes by voice,
    `decideSaveVoice`), DEV "ring in 2 min". The notification carries only the reminder id; a tap opens
    a normal Confirm card (rule 8), or "How much?" on Home if no amount. Settings lists and deletes.
  - **Amber**: `paymentWarnings` (first payment to this payee, > 3× the median of their Done payments,
    23:00–05:00 IST) → amber card: warning shown and spoken after the question; a second spoken yes or
    one tap on "Yes, I'm sure". `cardTone`. New `Notice tone="warning"`.
  - **Red-card offer**: `dailyOfferPaise` (OVER_DAILY only, what's left today in whole rupees, ≥ ₹1).
    Spoken "Send ₹X instead?"; "haan" or the button opens a NEW card (new txnRef) that asks again.
    Red cards still never confirm.
  - Found by the live eval and fixed: the model copied periods in the other script (the span check
    rejected them; code now reads the period from the user's words); "Papa ko dhai sau" came back as
    set_amount with a name (now: a name + an amount in the latest message is always `pay`, which also
    fixes "nahi, Rahul ko 300" as set_payee losing the 300); the spending examples in the prompt left
    out `amountText`, which the strict schema rejected.
  - Eval +25 cases (spending, reminders, pre-filter, amber, offer, reminder-card voice; examples 2, 4,
    6, 7, 10); new strict group `prefilter`.
- How it was tested: server 393 Vitest (+124: `when.ts`, `/turn` spending/reminder/pay upgrade), mobile
  732 Jest (+183), typecheck clean in both, Android bundle OK. Live on port 3999 with
  `openai/gpt-4.1-nano`: eval 69/70 then 70/70 (the one miss was example 3 returning unknown once,
  3/4 right in a repeat check: safe, the app asks again), smoke 10/10, server log types only.
- Not done: no "Notifications allowed" row in the Ready check yet; on the Confirm card a spending
  question or reminder is "not clear" (ask on Home).
- Next step: rebuild the development APK (notifications), M13 phone check (TEST-CHECKLIST "On-phone
  abilities"), then M14.

### 2026-10-19 — Theme from FlowPay.html (phone check pending)
- Built: `lib/theme.ts` with the design's colours (lavender `#F2F1F8`, purple `#5B4BD6`, text
  `#1E1B2E`, lines `#DEDCEE`) and `fonts`; Atkinson Hyperlegible (`@expo-google-fonts/atkinson-hyperlegible`,
  JS + font files, no new development build) loaded in `app/_layout.tsx` behind the splash screen (the
  system font if it fails); headers on the lavender background. `components/ui.tsx`: a `Text` with the
  app font, pill buttons, white cards with a thin border, soft-purple info notices. Every screen uses
  that `Text` and `fonts.bold` instead of `fontWeight`. No screen, button, text or behaviour changed.
- How it was tested: mobile 549 Jest green (unchanged), typecheck clean, `expo export --platform android`
  bundles. Not yet on a phone.
- Phone check (restart Metro with `npx expo start -c` first): text is in the rounded Atkinson font,
  lavender background, purple pill buttons, white cards; Home → Confirm → Yes → PhonePe, Settings,
  History and Receipt all work exactly as before.
- Next step: M13.

### 2026-10-16 — M11 Hindi end to end (phone check pending)
- Built (tests first, shown to the user; the user's changes added before implementing):
  - **Amount parser** (`amount.ts`): Devanagari number words 1–99, सौ, हज़ार, लाख, डेढ़, ढाई/अढ़ाई, सवा,
    साढ़े, पौने, रुपये/रुपए/रुपया/रु. Spelling variants folded first (ँ = ं, nukta dropped), so they share
    the Latin rules and grouping; a trailing "दो" is the verb, like "do". Romanized Hindi unchanged.
    Checked: no spelling is listed twice.
  - **Matching** (`match.ts`): new relatives भैया, दीदी, नानी/नाना, दादी/दादा, चाचा/चाची, भाभी, मामा
    (Devanagari only; the Latin "mama" is not mapped), मामी, मौसी/mosi, मौसा/mosa, बुआ, फूफा/fufa.
    Cross-script matching by a loose key (transliteration, vowel length, w/v, inherent "a"): a name in
    the other script matches too, and the results are COMBINED with the normal match (user's rule): an
    exact "Rahul" plus a different "राहुल" → "Which Rahul?", never a pick. Lookalikes (Amit/Amita) →
    "Which …?".
  - **Hindi speech** (`speech.ts`, `speechLang.ts`): every spoken text in English and Hindi; Home's
    questions, the card question, rule reasons, re-asks, cancel/pause are spoken in Hindi when the mic is
    हिं and a Hindi voice is installed, otherwise English. Screen text stays English. No prompt ends with a
    yes or cancel word (tested, both languages). Voice confirmation already listens in the mic's language.
  - Smoke +2 Devanagari phrases; eval +9 cases (Hindi turns, Hindi corrections/cancel on the card, a
    Hindi negation guard). The eval now paces itself under /turn's 30/min limit (a first run hit our own
    limiter: two 429s, not AI errors) and waits out a 429 once.
- How it was tested: server 269 Vitest (+54: Devanagari words/fractions/currency/verb/failures, romanized
  confirmations, full Devanagari sentences through /parse and /turn), mobile 549 Jest (+74: relatives,
  cross-script keys, combined matching, Hindi speech texts). Live on port 3999: eval 45/45 (GATE PASS),
  smoke 10/10, server log types only. Typecheck clean; Android bundle OK.
- Next step: M13 (spending questions, reminders, pre-filter, amber two-yes).

### 2026-10-16 — M12 Conversation + voice confirmation (phone check pending)
- Built (tests first, shown to the user and approved):
  - **Server `POST /turn`** (`src/turn.ts`, prompt `TURN_SYSTEM_PROMPT` in `llm.ts`; `/parse` kept for the
    Ready check and smoke): ≤ 12 turns / ≤ 6 user turns / last turn the user's; the AI returns one action
    (pay / set_amount / set_payee / cancel / unknown) with spans. Names must be in a user turn (not only
    in the app's questions); amounts only from the latest user turn, parsed by `parseAmount`; an amount
    repeated from an earlier user turn is dropped (the phone keeps its draft), one never said → unknown;
    relative words in the latest turn (kam, zyada, aur, double, aadha, कम, …) → `ask_exact`. Own rate
    limit (30/min). Logs only `turn: <action or error>`. `llm.ts` now shares one OpenRouter helper.
  - **Phone:** `lib/conversation.ts` (draft, next question, last 6 user turns sent), `lib/voiceConfirm.ts`
    (rule 8 decisions, 45 spec cases), `api.sendTurn`, an in-memory `conversation` store shared by Home
    and Confirm. Home is a chat: questions are spoken and the mic reopens once (dev build); "Start over".
    Confirm: mic after TTS + 250 ms for 5 s, a 🎤 Speak button, cancel / pause / re-ask / new card / not
    clear; the old card's txnRef is locked when replaced or cancelled; the conversation is reset after
    a payment or cancel. `lib/voiceYes.ts` removed (its rejection cases carried over as tests).
  - Found by the carried-over M8b tests and fixed: "ok" / "haan haan" alone could have confirmed if
    `/turn` ever reported the card's own payment. Now a yes + change needs words besides yes-words.
  - Eval: `npm run eval -- <url>` (`scripts/eval.ts`, 37 cases in `scripts/evals/turns.json`; voice cases
    run the phone's own `voiceConfirm.ts`). First live run 35/37: "Mummy ko bhejo" read as set_payee
    (same result on the phone, now accepted) and "Rahul ko" after "500 bhejo" (the repeated 500 made the
    step unknown; now dropped instead). Second run **37/37, GATE PASS** with `openai/gpt-4.1-nano`;
    `/parse` smoke 8/8; server log had only types, no text.
  - CLAUDE.md rules 1 and 8 rewritten; AGENT.md, ARCHITECTURE, TEST-CHECKLIST updated.
- How it was tested: server 215 Vitest (+55: `/turn` 47 incl. privacy and rate limit, `extractTurn` 5,
  earlier-turn amounts 3), mobile 475 Jest (+108: voice confirm, conversation, `sendTurn`), typecheck
  clean in both, `expo export --platform android` bundles, live eval + smoke on port 3999.
- Known limits: on the card, a change to an ambiguous or unknown name ("Haan, Rahul ko 300" with two
  Rahuls) is "not clear" (say it on Home instead). Red cards have no mic until M13 adds offers. Speech
  is English (en-IN) until M11.
- Next step: build the development APK (voice needs it), M12 phone check, then M11.

### 2026-10-16 — M10 Protect payees (phone check pending)
- Built (tests first, shown to the user; briefly paused in `git stash`, then resumed):
  - **Fingerprint/PIN before any payee change** (`lib/deviceAuth.ts`, pure with an injected API;
    `lib/deviceAuthNative.ts` wraps `expo-local-authentication`). Save and delete in `payee-edit`
    need a successful prompt; the phone's PIN/pattern works too. No screen lock → blocked with "Set a
    screen lock first" (the user's choice: block, not warn). Cancel → nothing happens.
  - **New-payee limit** (`rules.ts`): for 24 h after `addedAt` or `vpaChangedAt`, at most ₹500 per
    payment → `NEW_PAYEE_LIMIT`. Checked after the ₹3,000 limit, before unreadable history and the daily
    limit. A future timestamp counts as new. The Confirm card shows "New payee: up to ₹500 … for the next
    N hours" (or "UPI ID changed recently"), and the red card says when normal limits return.
  - **Payee schema v2** (`payees.ts`): `addedAt`, `vpaChangedAt`. Only a new UPI ID restarts the 24 h
    (same ID in another case/spacing doesn't; name, phone and alias edits don't). Payees saved before M10
    are migrated on first load as "saved now" (one 24 h cap, written back once); an entry with broken
    timestamps is corrupt, not migrated.
  - **Re-check right before the UPI app opens** (`pay.ts`): payee and history are read again; a deleted
    payee, a **changed UPI ID (`PAYEE_CHANGED`)**, another payment that crossed the daily limit, unreadable
    history or the new-payee limit → `{ kind: "blocked" }`, with no pending entry and no launch. Confirm
    shows the reason and a Home button (the txnRef stays locked).
  - **Write queue** (`storage.ts` `createWriteQueue`) for payees, history and the confirm lock. Fixes
    lost writes when two changes land at the same moment (two adds, add + status update, two locks) and
    a duplicate UPI ID slipping past the check.
- New package: `expo-local-authentication` ~57.0.3 (official, in Expo Go, adds USE_BIOMETRIC itself).
- How it was tested: mobile 367 Jest (+61: rules 21, payees 10 + 3 updated, pay 8, history/lock
  concurrency 4, write queue 3, device auth 17; fixtures now carry old timestamps). Typecheck clean,
  `expo export --platform android` bundles. Server unchanged (160).
- Next step: M10 + M9 phone checks, then M12.

### 2026-10-16 — M9 Demo-day reliability (phone check pending)
- Payment test first (user, on the phone): ₹1, ₹101, ₹500 with `tr` all paid to a second account and
  the receipt showed "Done" on its own. No fallback; `tr` stays on. `tr` off and "back on the PIN
  screen" not tested yet.
- Built:
  - **Ready check** (Settings → Ready check, all builds; `app/ready-check.tsx`): server, a `/parse`
    round trip with the fixed phrase "Mummy ko paanch sau bhejo" → 50000 paise, mic permission (read
    without prompting), contacts permission answered, an en-IN TTS voice, a UPI app for `upi://`, at
    least one payee, readable history, limit left today, rehearsal mode off, no rehearsal payments
    left. Each ❌ shows a one-line fix. Pure rows in `lib/readyCheck.ts`; `lib/readyCheckRun.ts`
    gathers the facts, each check catching its own errors.
  - **Rehearsal mode** (`lib/rehearsal.ts`, Settings switch, persisted, off by default): a fake launcher
    (800 ms, then "success"; no app opens), txnRefs start with "RH", a "REHEARSAL — no money moves"
    banner on Home, Confirm and Receipt, a "Rehearsal" tag in payment lists, no Share on rehearsal
    receipts, "Clear rehearsal payments (n)". The txnRef prefix and the current mode must agree,
    checked when Confirm loads and again on Yes; if the mode was switched in between nothing is sent
    ("Start it again from Home"). Rehearsal payments count toward the daily limit until cleared.
  - **Server:** optional `OPENROUTER_FALLBACK_MODEL`; when set (and different) the request sends
    `models: [primary, fallback]` instead of `model` (OpenRouter docs: raw-HTTP form). `.env.example`
    has the new line.
  - **Phone `/parse`:** two attempts of 7 s; the retry happens only when no answer came (network error
    or timeout), never after any server answer. Total ≤ 14 s.
  - **Mic language** (EN/हिं) remembered across restarts (AsyncStorage).
  - **Doc drift fixed:** "opens PhonePe directly" (CLAUDE.md, ARCHITECTURE), ARCHITECTURE "keyboard mic
    first", the `upi.ts` header, the PROGRESS chooser known issue. ARCHITECTURE failure table: rehearsal
    switch, retry, fallback model.
- How it was tested: server 160 Vitest (+6: models/model body, `modelChoice`), mobile 306 Jest (+41:
  readyCheck rows, rehearsal refs/launcher choice/setting, mic language, `/parse` retry incl. fake-timer
  timing and "no retry after an answer"). Typecheck clean (typed routes regenerated with a short Metro
  run on port 8099), `expo export --platform android` bundles. No new packages (an accidental ESLint
  install by `expo lint` was reverted and `npm ci` run; see Known issues).
- Next step: the M9 phone check, then M10.

### 2026-10-16 — Planning: reliability, safety, agent (docs only)
- Built: no code. New `docs/AGENT.md` (agent design, voice-confirmation spec + 45 test cases, tools,
  safety model, 10 example conversations, eval plan). `docs/PROMPTS.md`: payment test step + M9–M15
  prompts. CLAUDE.md points to AGENT.md and notes the planned rule 8 change. ARCHITECTURE "Coming
  later" updated.
- How it was tested: both suites green before planning (server 154 Vitest, mobile 265 Jest,
  typechecks clean).
- Doc vs code mismatch found: TEST-CHECKLIST expects "मम्मी को पांच सौ भेजो" to work, but
  `amount.test.ts` requires "पांच सौ" to fail (Devanagari number words were out of scope). M11 fixes it.
- Next step: the payment test (DEPLOY.md step 3), then M9.

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
