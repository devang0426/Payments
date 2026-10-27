# FlowPay — Project guide for Claude Code

FlowPay is an Android demo app: the user says "Mummy ko 500 bhejo" (send 500 to Mom), the app
understands it, shows a confirmation, and opens PhonePe via a UPI intent (an implicit intent: Android
opens the default UPI app, or shows a chooser), where the user enters their own PIN.

Full design: `docs/ARCHITECTURE.md`. Current progress: `docs/PROGRESS.md`. Visual theme: `FlowPay.html`
(repo root; colours, font and button style only — the app's screens and flow stay as built).
Read both at the start of every session. From M12 on, also read `docs/AGENT.md` (agent design and
the voice-confirmation spec).

## Hard rules (never break these)

1. **The AI only understands.** The server's AI only picks an action and copies spans from what the
   user said (`/parse`: `{ name, amountText }`; `/turn`: `{ action, nameText, amountText, periodText,
   whenText }`; `/agent` (M14): tool calls with the same spans, checked by the same code; the model's
   own text is never used). Spans not in the user's own words are rejected. The amount is always converted to
   integer paise by the code in `apps/server/src/amount.ts`; periods and reminder dates by
   `apps/server/src/when.ts`. A number produced by the AI never becomes a payment amount, and a
   relative amount ("100 kam", "double") is never worked out by anyone: the app asks for the exact amount.
2. **Money = integer paise.** Never use floats for money anywhere. ₹500 = `50000`.
   Convert to rupees only for display.
3. **Privacy:** contacts, phone numbers, UPI IDs (VPAs) and payment history never go to the server
   or the AI. The server only receives the spoken/typed text.
4. **Secrets:** `OPENROUTER_API_KEY` lives only on the server. No keys in mobile code.
   `EXPO_PUBLIC_*` variables are bundled into the app, so they hold only the server URL.
5. **Gitignored files:** `.env`, `apps/server/.env`, `apps/mobile/.env`. Never commit, print, log or
   paste their contents. Real UPI IDs are never in files at all: the user adds payees in Settings on
   the phone. For examples and tests, use the fake data in `lib/__tests__/fixtures.ts` (`*.fake@upi`).
6. **Guardrails (on the phone):** ₹3,000 per payment (`300000` paise), ₹5,000 per day (`500000` paise,
   IST calendar day). The payee must exist in the payees saved in Settings. Any rule failure = red
   card + reason, and PhonePe does not open. Payments with status "pending" or "unknown" also count
   toward the daily limit (err on the safe side). For 24 h after a payee is added or gets a new UPI ID,
   at most ₹500 (`50000` paise) per payment. The rules run when the Confirm card opens **and again in
   `sendPayment` right before the UPI app opens** (payee and history re-read; a changed UPI ID blocks).
   Adding, editing or deleting a payee needs the phone's fingerprint/PIN; no screen lock = no payee
   changes.
7. **The app never sees the UPI PIN.** Payment happens only via UPI intent, inside PhonePe.
8. **Confirmation is mandatory:** the intent is never launched without the confirm card plus the
   user's **yes**: a tap on "Yes", or (development/release builds) a spoken yes decided by code in
   `lib/voiceConfirm.ts`, exactly as in `docs/AGENT.md` "Voice confirmation". The mic opens only after
   the question has been spoken, for 8 s (5 s until 2026-10-22). A strict yes phrase confirms (the list
   includes the recognizer's spellings: han, haa, okay, theek hai…); a yes + change confirms only if
   code finds the same payee and paise as the card; a different change makes a new card with a new
   txnRef (the old one can never be confirmed); cancel phrases cancel, pause phrases pause; late, stale
   or echoed speech is ignored; anything else is "not clear" (asked once more aloud, then the tap
   button). Never on a red card. Amber (second yes): an unusually large amount or late night only. Voice and tap call
   the same yes(), behind the persisted confirm lock (keyed by txnRef), so a double tap, voice + tap,
   re-render or re-mount can never launch the intent twice.
9. If the server or internet fails, the payment never proceeds. Show "Couldn't understand that,
   please try again."
10. **Pending before launch:** write a `pending` history entry (keyed by txnRef) *before* launching
    the intent, then update it from the result. On app start, any entry still `pending` is resolved
    by asking "Did the payment go through?" (Android may kill the app while PhonePe is open).

## Repo layout

```
flowpay/
  CLAUDE.md
  FlowPay.html              visual theme reference (a packed page, open it in a browser)
  docs/                     ARCHITECTURE, PROMPTS, PROGRESS, TEST-CHECKLIST, DEPLOY, AGENT
  apps/
    mobile/                 Expo SDK 57 (React Native) + TypeScript + Expo Router + StyleSheet
      app/                  screens: index (Home), confirm, choose ("Which Mummy?"), receipt,
                            settings, payee-edit, history, ready-check, reminder, upi-check,
                            alias (M15 "Add a name", fingerprint/PIN), scan-qr (payee's UPI QR → form)
      components/           ui.tsx (Text, Screen, Button, Card, Notice, Field), PaymentRow.tsx,
                            RehearsalBanner.tsx
      lib/
        match.ts            name normalization + matching against payee aliases, across Latin and
                            Devanagari (lookalikes → "Which X?") (pure, tested)
        speech.ts           everything the app speaks, English + Hindi (pure, tested);
                            speechLang.ts picks the language
        phone.ts            normalizePhone() → +91XXXXXXXXXX (pure, tested)
        contacts.ts         only for the "No UPI ID saved for X" hint (expo-contacts, new API)
        payees.ts           payees in SecureStore, added/edited in Settings (Zod validated;
                            addedAt / vpaChangedAt for the new-payee limit)
        deviceAuth.ts       fingerprint/PIN gate for payee changes (pure, tested);
                            deviceAuthNative.ts = expo-local-authentication
        rules.ts            limits + IST day + 24 h new-payee limit (pure, tested)
        upi.ts              build UPI URI + read the UPI app's response + parseUpiQr (a payee's QR →
                            UPI ID + suggested name; amounts ignored) (pure, tested)
        camera.ts           expo-camera, loaded optionally (scan a payee's UPI QR in Add payee)
        upiLaunch.ts        opens the UPI app via expo-intent-launcher, implicit VIEW intent
                            (DEV: tr switch, last raw result)
        rehearsal.ts        rehearsal mode: fake launcher, "RH" txnRefs, persisted switch (pure parts tested)
        readyCheck.ts       pre-demo checks → ✅/❌ rows (pure, tested); readyCheckRun.ts gathers the facts
        history.ts          local payments in AsyncStorage, incl. pending (built in M3)
        storage.ts          KeyValueStore interface + SecureStore/AsyncStorage adapters +
                            createWriteQueue (every store's changes run one at a time)
        stores.ts           app-wide payeeStore / historyStore / confirmLock instances
        flow.ts             parsed command → noPayee / choose / confirm (+ rule result) (pure)
        format.ts           ₹ display (Indian grouping), masked UPI ID, IST time (pure)
        confirmLock.ts      persisted one-Yes-per-txnRef lock
        pay.ts              sendPayment: re-check rules → pending entry → launcher → status
        api.ts              server /health, /parse, /turn and /agent calls (2 × 7 s, one retry on network
                            error/timeout only; Zod; any failure → FAILED)
        voice.ts            in-app speech-to-text (expo-speech-recognition; hidden in Expo Go),
                            mic language remembered
        voiceConfirm.ts     what speech on the Confirm card means: confirm / change / cancel / pause /
                            re-ask / not clear (pure, tested; rule 8)
        voiceFlow.ts        voice-first Home + receipt (M16): greeting, one nudge then quiet, spoken
                            result (pure, tested; docs/VOICE-PLAN.md)
        helper.ts           family helper (M17): name + phone in SecureStore, tel: link, the spoken
                            "Should I call…?" answer (pure parts tested); components/CallHelper.tsx
        conversation.ts     the conversation: draft, next question, what /turn gets (pure, tested)
        agent.ts            M14: the /agent step loop (≤ 4 steps, 20 s) + what the phone does with the
                            actions; extra payments wait in stores.paymentQueue (pure, tested)
        preferences.ts      M15: reply language, speak replies (AsyncStorage + Zod), which voice (pure, tested)
        alias.ts            M15: may a nickname be added to a payee (never one that reaches another) (pure, tested)
        explain.ts          M15: "Kyun block hua?" from the last outcome (memory, 10 min) (pure, tested)
        prefilter.ts        UPI ID / phone number in the text → never sent; UPI ID facts, no verdict
                            (pure, tested; api.ts checks again before every request)
        spending.ts         IST period ranges + totals from local history (pure, tested)
        reminders.ts        reminder dates (9 AM IST), store, what a tapped reminder opens (pure
                            parts tested); remindersNative.ts = expo-notifications (local only);
                            reminderRun.ts wires them to the stores
        theme.ts            colors, fonts, spacing, font sizes for StyleSheet (from FlowPay.html)
        strings.ts          all user-facing text in one place
        __tests__/fixtures.ts  fake payees for tests (*.fake@upi)
      plugins/withUpiQueries.js  Android <queries> for upi:// (config plugin)
      app.json, eas.json    package com.flowpay.demo; EAS profiles development / preview / production
    server/
      src/app.ts            Express app + routes (no listen), imported by tests
      src/index.ts          entry: loads .env, exports app for Vercel, listens only when not on
                            Vercel
      src/amount.ts         spoken amount → paise, Latin + Devanagari number words (pure, tested)
      src/parse.ts          /parse logic: AI output → Zod → substring guard → parseAmount
      src/turn.ts           /turn logic (one conversation step): action + spans → guards → parseAmount
                            (checkAiTurn, shared with /agent)
      src/agent.ts          /agent logic (M14): one tool-calling step; every call checked by checkAiTurn;
                            several payments split per person; find_payee runs on the phone
      src/tools.ts          the agent's tools + system prompt (no tool can pay, edit UPI IDs or limits)
      src/when.ts           spoken period ("is mahine") / reminder date ("1 tareekh") → fixed value
                            (pure, tested)
      scripts/eval.ts       live eval of /turn + voice decisions (cases in scripts/evals/turns.json)
      src/llm.ts            OpenRouter call (returns raw JSON; errors carry only a type;
                            optional OPENROUTER_FALLBACK_MODEL via `models`)
```

`apps/mobile` and `apps/server` are **two separate npm projects**. Do not set up npm workspaces at
the root (a monorepo setup with Expo's Metro bundler is more hassle than a demo needs).

## Commands

```
# server
cd apps/server && npm run dev        # local server, port from .env (default 3000)
cd apps/server && npm test           # Vitest

# mobile
cd apps/mobile && npx expo start     # development build (in-app mic); see docs/DEPLOY.md
cd apps/mobile && npm run start:go   # Expo Go (no in-app mic)
cd apps/mobile && npm test           # Jest
cd apps/server && npm run smoke -- <url>   # live /parse check (server running)
cd apps/server && npm run eval -- <url>    # live /turn + voice eval, gate ≥ 95% (server running)
```

## Code conventions

- TypeScript strict mode in both projects.
- Keep pure logic (amount, match, phone, rules, UPI URI) free of React/Expo imports so tests run
  without a phone.
- Validate the server response, the payees read from SecureStore and the history read from
  AsyncStorage with Zod. Validation failure = user-friendly error, never a crash.
- Styling: React Native `StyleSheet` + `lib/theme.ts`. No NativeWind/Tailwind. The theme follows
  `FlowPay.html`: lavender background, one purple accent, Atkinson Hyperlegible font (loaded in
  `app/_layout.tsx`), pill buttons, white cards. Use `Text` from `components/ui.tsx` (it sets the font)
  instead of React Native's, and `fontFamily: fonts.bold` instead of `fontWeight` (a custom font has
  no automatic bold on Android). Theme changes never change screens, navigation or behaviour.
- Dates and limits use IST, computed as a fixed UTC+05:30 offset (India has no DST). Don't rely on
  `Intl` time zone support.
- Logging: never log the user's text in production. Log error types, not content.
- All UI text is English and lives in `lib/strings.ts`. Spoken replies may be Hindi (M11): every
  spoken text, in both languages, lives in `lib/speech.ts`; `lib/speechLang.ts` speaks Hindi only when
  the mic is हिं and the phone has a Hindi voice. No spoken prompt may end with a yes or cancel word.
- Voice input will be in Hinglish/Hindi, in **Latin and Devanagari script** (e.g. "Mummy ko paanch
  sau bhejo", "मम्मी को ५०० भेजो"), so parsing and name matching must handle Hindi number words,
  Devanagari digits and relationship names.

## How to work

- One session = one milestone (see `docs/PROMPTS.md`). Don't build anything outside its scope.
- For money/safety files (`amount.ts`, `rules.ts`, `upi.ts`, `match.ts`, `phone.ts`): **tests first, then
  implementation**. Show the tests to the user before writing the code.
- Small diffs. Explain why before installing any new package.
- For anything that can only be tested on the phone (contacts, PhonePe, mic, TTS), give the user
  exact steps for what to check.
- At the end of a milestone, update `docs/PROGRESS.md`: what was built, what's left, known issues.
- If something doesn't work after 2-3 attempts, stop, explain the cause, and suggest a different
  approach.
