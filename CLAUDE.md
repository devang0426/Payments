# FlowPay — Project guide for Claude Code

FlowPay is an Android demo app: the user says "Mummy ko 500 bhejo" (send 500 to Mom), the app
understands it, shows a confirmation, and opens PhonePe directly via a UPI intent, where the user
enters their own PIN.

Full design: `docs/ARCHITECTURE.md`. Current progress: `docs/PROGRESS.md`.
Read both at the start of every session.

## Hard rules (never break these)

1. **The AI only understands.** The server's AI only extracts `{ name, amountText }`. The amount is
   always converted to integer paise by the code in `apps/server/src/amount.ts`. A number produced
   by the AI never becomes a payment amount directly.
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
   toward the daily limit (err on the safe side).
7. **The app never sees the UPI PIN.** Payment happens only via UPI intent, inside PhonePe.
8. **Confirmation is mandatory:** the intent is never launched without the confirm card plus the
   user's **tap** on "Yes". The confirm lock is persisted (keyed by txnRef), not just component
   state, so a double tap, re-render or screen re-mount can never launch the intent twice. Voice
   "Yes" (built in M8b, development/release builds only) is strict: the mic starts only after the
   TTS question has finished, listens once, and only a whole "yes" / "haan" / "हाँ" phrase from
   `lib/voiceYes.ts` counts; it calls the same locked Yes as the button. Anything else does nothing.
9. If the server or internet fails, the payment never proceeds. Show "Couldn't understand that,
   please try again."
10. **Pending before launch:** write a `pending` history entry (keyed by txnRef) *before* launching
    the intent, then update it from the result. On app start, any entry still `pending` is resolved
    by asking "Did the payment go through?" (Android may kill the app while PhonePe is open).

## Repo layout

```
flowpay/
  CLAUDE.md
  docs/                     ARCHITECTURE, PROMPTS, PROGRESS, TEST-CHECKLIST, DEPLOY
  apps/
    mobile/                 Expo SDK 57 (React Native) + TypeScript + Expo Router + StyleSheet
      app/                  screens: index (Home), confirm, choose ("Which Mummy?"), receipt,
                            settings, payee-edit, history
      components/           ui.tsx (Screen, Button, Card, Notice, Field), PaymentRow.tsx
      lib/
        match.ts            name normalization + matching against payee aliases (pure, tested)
        phone.ts            normalizePhone() → +91XXXXXXXXXX (pure, tested)
        contacts.ts         only for the "No UPI ID saved for X" hint (expo-contacts, new API)
        payees.ts           payees in SecureStore, added/edited in Settings (Zod validated)
        rules.ts            limits + IST day (pure, tested)
        upi.ts              build UPI URI + read the UPI app's response (pure, tested)
        upiLaunch.ts        opens PhonePe via expo-intent-launcher (DEV: tr switch, last raw result)
        history.ts          local payments in AsyncStorage, incl. pending (built in M3)
        storage.ts          KeyValueStore interface + SecureStore/AsyncStorage adapters
        stores.ts           app-wide payeeStore / historyStore / confirmLock instances
        flow.ts             parsed command → noPayee / choose / confirm (+ rule result) (pure)
        format.ts           ₹ display (Indian grouping), masked UPI ID, IST time (pure)
        confirmLock.ts      persisted one-Yes-per-txnRef lock
        pay.ts              sendPayment: pending entry → launcher → status
        api.ts              server /health + /parse calls (12 s timeout, Zod; any failure → FAILED)
        voice.ts            in-app speech-to-text (expo-speech-recognition; hidden in Expo Go)
        voiceYes.ts         strict voice "Yes" matcher (pure, tested)
        theme.ts            colors, spacing, font sizes for StyleSheet
        strings.ts          all user-facing text in one place
        __tests__/fixtures.ts  fake payees for tests (*.fake@upi)
      plugins/withUpiQueries.js  Android <queries> for upi:// (config plugin)
      app.json, eas.json    package com.flowpay.demo; EAS profiles development / preview / production
    server/
      src/app.ts            Express app + routes (no listen), imported by tests
      src/index.ts          entry: loads .env, exports app for Vercel, listens only when not on
                            Vercel
      src/amount.ts         spoken amount → paise (pure, tested)
      src/parse.ts          /parse logic: AI output → Zod → substring guard → parseAmount
      src/llm.ts            OpenRouter call (returns raw JSON; errors carry only a type)
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
```

## Code conventions

- TypeScript strict mode in both projects.
- Keep pure logic (amount, match, phone, rules, UPI URI) free of React/Expo imports so tests run
  without a phone.
- Validate the server response, the payees read from SecureStore and the history read from
  AsyncStorage with Zod. Validation failure = user-friendly error, never a crash.
- Styling: React Native `StyleSheet` + `lib/theme.ts`. No NativeWind/Tailwind.
- Dates and limits use IST, computed as a fixed UTC+05:30 offset (India has no DST). Don't rely on
  `Intl` time zone support.
- Logging: never log the user's text in production. Log error types, not content.
- All UI text is English and lives in `lib/strings.ts`.
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
