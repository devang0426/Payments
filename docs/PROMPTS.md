# FlowPay — Milestone prompts

Paste each prompt in plan mode. One session = one milestone. Commit and `/clear` after each one.

The order is deliberate: the riskiest unknowns are checked early (real PhonePe behaviour in the
M0.5 spike right after the scaffold, then money parsing in M1), and wiring in the AI comes near the
end.

---

## M0 — Scaffold

```
Read docs/ARCHITECTURE.md and CLAUDE.md. Do M0: the project skeleton.

1. apps/server: Node + Express + TypeScript (strict). `npm run dev` with tsx, `npm test` with Vitest.
   GET /health → { ok: true }. Read PORT via dotenv (default 3000).
   Make it Vercel-ready from the start: src/index.ts builds the app and does `export default app`;
   it calls app.listen(PORT, "0.0.0.0") only when process.env.VERCEL is not set (0.0.0.0 so the
   phone can reach it over the same Wi-Fi/hotspot).
2. apps/mobile: `npx create-expo-app@latest` (Expo SDK 57, default template with Expo Router) +
   TypeScript. Remove the template's example screens. Styling with React Native StyleSheet and a
   small lib/theme.ts (colors, spacing, font sizes). No NativeWind.
   One Home screen that shows "FlowPay" and calls /health at EXPO_PUBLIC_API_URL, displaying the
   status. Set up Jest (jest-expo preset). Create lib/strings.ts for all UI text.
3. Two separate npm projects, no root workspaces.
4. The .env.example files already exist; don't change them. Check .gitignore.
5. Update docs/PROGRESS.md.

Tell me exactly what to check on the phone.
```

**Done**
- [ ] `cd apps/server && npm run dev` runs, and `http://localhost:3000/health` in a browser → `{"ok":true}`
- [ ] `cd apps/mobile && npx expo start`, scan the QR with Expo Go, the app opens
- [ ] The app shows server status "ok" (laptop and phone on the same Wi-Fi or hotspot, laptop IP in `.env`)
- [ ] `npm test` runs in both projects (a dummy test is fine for now)

Tip: the Windows firewall can block the phone from reaching the laptop. If the status fails,
check that first (allow inbound TCP 3000 and 8081 on the Private profile), then check that the
phone is on the same Wi-Fi/hotspot as the laptop and that the IP in `.env` is still current.

---

## M0.5 — PhonePe spike (real intent, before anything else is built)

```
Do M0.5: a throwaway DEV-only spike to see how PhonePe really handles our UPI intent.

1. app/dev-upi.tsx, reachable only when __DEV__ is true (a small link on Home, hidden otherwise).
2. Inputs typed at runtime: UPI ID, payee name, amount in rupees. Keep them only in component
   state: never store, log or commit them. Validate the amount as ^\d+(\.\d{2})?$ and build the
   `am` string directly from it (no float math). A toggle "include tr" (txnRef = timestamp + random).
3. Build upi://pay?pa=..&pn=..&am=..&cu=INR&tn=FlowPay test[&tr=..] with correct URL encoding
   (a small inline builder is fine; the real, tested one comes in M3).
4. "Launch PhonePe" → expo-intent-launcher startActivityAsync("android.intent.action.VIEW",
   { data: uri }) (packageName alone is ignored by the library, so Android picks the UPI app or
   shows a chooser). Catch launch errors (no UPI app installed).
5. Show the raw result as pretty JSON: resultCode, data, extra (everything, nothing parsed).
6. Add a "Spike results" table to docs/PROGRESS.md for me to fill in (no UPI IDs in it).

This screen is deleted in M5.
```

**Done (you, on the phone)**: every payment to a **second account** (not your own PhonePe account)
- [ ] ₹1 with `tr` and ₹1 without `tr`
- [ ] ₹101 with and without `tr`
- [ ] ₹500 with and without `tr` (family sends it back)
- [ ] Once: press back on the PIN screen and note the raw result
- [ ] For each: did PhonePe accept it, which error (if any), and what `resultCode` / `extra` came back.
  Write it in the "Spike results" table in `docs/PROGRESS.md` (no UPI IDs)

---

## Decision step — after M0.5, before M4

Not a Claude prompt: read the spike results together with Claude and decide.

- **All amounts work** → continue as planned. Note whether `extra.response` exists and whether `tr`
  made a difference (M3's `buildUpiUri` and M5 follow this).
- **Normal amounts (₹101/₹500) fail, or everything fails** → pick one fallback and record it under
  Decisions in `docs/PROGRESS.md`, then adjust the M5 prompt **before starting M4**:
  1. The payee uses a **merchant UPI ID** (e.g. PhonePe Business). Same flow, no code change.
  2. **Copy UPI ID + open PhonePe**: the app copies the ID and opens PhonePe; the user pastes it
     and types the amount. The payment is recorded as "unknown" until the user answers
     "Did the payment go through?".
  3. **QR code** on the Confirm screen (only useful when scanned from another phone).

---

## M1 — Amount parser (the most important piece)

```
Do M1: apps/server/src/amount.ts. Function: parseAmount(text: string) →
{ ok: true, paise: number } | { ok: false, reason: string }.
Paise are always integers. Never calculate money with floats (handle fractions in paise).

FIRST write only the Vitest tests and show them to me. At minimum these cases
(input is Hinglish/Hindi as spoken by Indian users):
- Digits: "500" → 50000, "₹500", "Rs 500", "rs.500", "500 rupaye", "500 rs", "1,500" → 150000,
  "250.50" → 25050
- Currency words: "ek rupaya" → 100, "500 rupiya", "500 rupees", "500 rupay"
- Devanagari digits: "५००" → 50000, "₹५००" → 50000, "१,५००" → 150000
- Hindi number words: ek (1), do (2), teen (3), chaar (4), paanch (5), chhe (6), saat (7),
  aath (8), nau (9), das (10), bees (20), pachaas (50), sau (100), hazaar/hajar/hazar (1000)
- 11–99: support the Hindi words from gyarah (11) to ninyanve (99). Test at least gyarah (11),
  pachees (25), tees (30), chaalees (40), pachattar (75), ninyanve (99), and "ek sau pachees" → 12500
- Combinations: "paanch sau" → 50000, "do hazaar" → 200000, "do hazaar paanch sau" → 250000,
  "ek sau bees" → 12000
- Lakh: lakh/laakh/lac, "ek lakh" → 10000000, "1 lakh" → 10000000, "dedh lakh" → 15000000
  (parse it correctly; limits are not checked here)
- Fractions: "dedh sau" (1.5×100) → 15000, "dhai sau" (2.5×100) → 25000,
  "saadhe teen sau" (3.5×100) → 35000, "sawa sau" (1.25×100) → 12500,
  "paune do sau" (1.75×100) → 17500, "dedh hazaar" → 150000
- Mixed: "5 sau" → 50000, "2 hazaar" → 200000, "1.5k" → 150000, "2k" → 200000
- Spelling variants: "paach", "panch", "dhaai", "sade", "saade"
- Ambiguity: a trailing "do" after an amount is always the verb "give" and is ignored:
  "paanch sau do" → 50000, "do sau do" → 20000, "ek sau do" → 10000, "500 do" → 50000
  (₹102 must be said with digits, "102"). "do" alone → 200.
  "saat" (7) vs "saath" (60): "saat" → 700, "saath" → 6000, "saat sau" → 70000,
  "saath sau" (60×100 = ₹6,000) → 600000.
- Failure cases (ok:false): "", "kuch paise" (some money), "bahut saare" (a lot), "0", "-500",
  text with more than one amount like "500 ya 600" (500 or 600)

Out of scope for now: Devanagari number *words* (e.g. "पांच सौ"). They must fail safely with
ok:false (the phone then asks "How much do you want to send?").

Don't check limits here (that's rules.ts on the phone); just parse correctly.
Once I approve the tests, implement until all are green. Update PROGRESS.md.
```

**Done**
- [ ] All tests green
- [ ] You read the test file yourself and had 3-4 of your own cases added (the way your family
  actually talks)

---

## M2 — /parse endpoint + OpenRouter

```
Do M2: POST /parse in apps/server.

Request: { text: string } (Zod validated, max 300 chars).
Flow:
1. src/llm.ts: OpenRouter chat completions call (OPENROUTER_API_KEY, OPENROUTER_MODEL from env).
   System prompt: from a Hinglish/Hindi/English payment command, extract only { name, amountText }
   as JSON. Both must be copied EXACTLY as they appear in the input: same script (Latin or
   Devanagari), same spelling, no translation, no conversion. Use null if the name or amount isn't
   present. Use JSON mode if the model supports it. 10 second timeout.
2. Validate the AI output with Zod.
3. Hallucination guard: normalize the input and the AI values the same way (Unicode NFC, lowercase,
   collapse whitespace). If name is not a substring of the normalized input → NO_NAME. If
   amountText is not a substring → NO_AMOUNT.
4. Convert amountText to paise with parseAmount(). Never use a number from the AI directly.
5. Response:
   { ok: true, name: string, amount: { kind: "paise", paise: number } | { kind: "last" } }
   | { ok: false, error: "NO_NAME" | "NO_AMOUNT" | "AI_FAILED" | "BAD_INPUT" }
   M2 only ever returns kind "paise". kind "last" is reserved for M7 ("same as last time"), so the
   contract never has to change.

Also:
- A simple rate limit (express-rate-limit, e.g. 30 req/min per IP) so API key costs can't run away.
  (`trust proxy` for Vercel is added in M8a. The real cost cap is the credit limit on the
  OpenRouter key.)
- Don't log the user's text, only the error type.
- Tests: mock llm.ts and cover every /parse branch (with supertest), including the substring guard
  (AI returns a name or amount that isn't in the text).
- Put a curl example in docs/PROGRESS.md.
```

**Done**
- [ ] You added the key and model to `apps/server/.env` yourself, and set a credit limit on the key
- [ ] `curl` with "Mummy ko paanch sau bhejo" →
  `{"ok":true,"name":"Mummy","amount":{"kind":"paise","paise":50000}}`
- [ ] "Papa ko dhai sau" and "Rahul ko 1.5k" also correct
- [ ] "मम्मी को ५०० भेजो" → `{"ok":true,"name":"मम्मी","amount":{"kind":"paise","paise":50000}}`
- [ ] "kya haal hai" (how are you) → `ok:false`
- [ ] Mock tests green

---

## M3 — Phone-side pure logic + storage (no UI)

```
Do M3: pure logic + Jest tests in apps/mobile/lib, plus the storage modules. No UI yet.

1. lib/match.ts: normalizeName() (lowercase, strip Hindi honorific suffixes like "ji", "jee",
   "bhaiya", "didi", extra spaces). Built-in relationship aliases: mummy/mumma/mumy/mom/maa/मम्मी,
   papa/pappa/dad/पापा.
   matchPayees(spokenName, payees[]) over each payee's displayName and aliases →
   { kind: "one", payee } | { kind: "many", payees } | { kind: "none" }.
2. lib/phone.ts: normalizePhone(raw) → "+91XXXXXXXXXX" | null. Tests: "+91 90000 00001",
   "09000000001", "9000000001", "91-9000000001", "+91-90000-00001" → "+919000000001";
   too short, letters, non-Indian numbers → null.
3. lib/rules.ts: istDayKey(timestamp) using a fixed UTC+05:30 offset (no Intl time zones).
   checkPayment({ amountPaise, payee, todayHistory }) →
   { ok: true } | { ok: false, reason: "OVER_PER_PAYMENT" | "OVER_DAILY" | "NO_PAYEE" | "ZERO" }.
   Limits: 300000 / 500000 paise. History entries with status "pending", "success" and "unknown"
   count; "failed" doesn't.
4. lib/upi.ts (pure part only): buildUpiUri({ vpa, name, amountPaise, note, txnRef? }) →
   upi://pay?pa=..&pn=..&am=500.00&cu=INR&tn=..[&tr=..] (correct URL encoding, am always 2 decimals,
   built from integer paise without floats). Include tr or not according to the M0.5 decision.
   parseUpiResponse(responseString) → "success" | "failed" | "unknown"
   (format: "txnId=..&responseCode=..&Status=SUCCESS&txnRef=.."; case-insensitive,
   missing = unknown).
5. lib/payees.ts: Zod schema { id, displayName, vpa, phone?, aliases[] }; list/add/update/delete in
   SecureStore. Corrupt data → user-friendly error, no crash. No seed file: payees are only added
   in Settings.
6. lib/history.ts: payments in AsyncStorage { id, txnRef, payeeId, payeeName, amountPaise, status:
   "pending" | "success" | "failed" | "unknown", createdAt }. Validate with Zod on read (no crash on
   corrupt data). add(), updateStatusByTxnRef(), listToday() (IST), listPending().
7. Fake test data lives in lib/__tests__/fixtures.ts (*.fake@upi IDs, +91900000000x numbers).
8. Jest tests for every edge case: two payees with the alias "mummy", Devanagari "मम्मी", name not
   found, exactly ₹3,000 (allowed), ₹3,000.01 (blocked), close to the daily limit, pending entries
   counting, 11:59 PM vs 12:01 AM IST, UPI response variants, phone formats.

Show me the tests first, then implement.
```

**Done**
- [ ] All Jest tests green
- [ ] No `payees.local.json`, `payees.example.json` or postinstall script exists

---

## M4 — Screens (no AI yet)

```
Do M4: the UI flow with StyleSheet + lib/theme.ts, without the server.

Screens (Expo Router):
- Home (app/index.tsx): large text input "Who do you want to pay, and how much?" (the user can
  dictate with the keyboard mic), "Next" button. For now use a FAKE parser (lib/fakeParse.ts:
  the pattern "<name> ko <number>") so the flow can be tested. Last 5 payments below.
- Confirm (app/confirm.tsx): payee name, masked UPI ID, last 4 digits of the phone if saved, large
  amount (₹500), "Yes, send" and "No" buttons. If a rule fails, show a red card with the reason, and
  don't show the "Yes" button at all. "Yes" disables after one tap, and the lock is persisted
  (keyed by txnRef) so a re-mount can't enable it again.
- Disambiguation: if matchPayees returns "many", show a "Which Mummy?" list.
- No payee matched: look the name up in contacts (expo-contacts, the new SDK 57 class-based API,
  not the legacy *Async functions). Found in contacts → "No UPI ID saved for Mummy" + a button to
  Settings. Not found → "I don't know Mummy yet" + a button to Settings.
- Receipt (app/receipt.tsx): status (Done / Failed / Unknown), amount, name, time, txnRef.
- Settings (app/settings.tsx): payee list with add/edit/delete including aliases (SecureStore),
  amount sent today. DEV-only (__DEV__) section: "Seed fake history" (adds fake entries for today,
  e.g. ₹4,500 total) and "Clear fake history".

Request contacts permission only when it's needed (no payee matched); if denied, explain why it's
helpful and keep working with payees.
Rules come from lib/rules.ts: checkPayment({ amountPaise, payee, history, now, historyUnreadable })
(pass the full history and `corrupt` from historyStore.load()). Every reason needs a red-card text
in strings.ts, including INVALID_AMOUNT and HISTORY_UNREADABLE ("Payment history can't be read.
Payments are paused until it's cleared in Settings."), plus a "Clear unreadable history" action in
Settings.
For now, "Yes" must NOT open PhonePe; go straight to Receipt with a fake "success".
Simple, clean UI with big buttons (parents should be able to use it too).
All text goes through lib/strings.ts.
```

**Done**
- [ ] Add a payee "Mummy" in Settings, type "Mummy ko 500" and reach Confirm with the right name and amount
- [ ] "Mummy ko 4000" → red card, no Yes button
- [ ] Settings → Seed fake history (₹4,500), then "Mummy ko 600" → red card (daily limit)
- [ ] Two payees with the alias "mummy" → a "Which Mummy?" list appears
- [ ] A contact without a saved payee → "No UPI ID saved for …" + Settings button
- [ ] Close and reopen the app, the payee is still there

---

## M5 — Real PhonePe

```
Do M5: launchPhonePe() in lib/upi.ts, following the M0.5 decision.

- expo-intent-launcher startActivityAsync, action "android.intent.action.VIEW",
  data = buildUpiUri(...). Note: packageName alone is ignored by expo-intent-launcher (it needs
  className too), so follow what the M0.5 spike showed (chooser / default UPI app).
- Before launching: write a history entry with status "pending" (keyed by txnRef) and persist the
  confirm lock. Pending entries count toward the daily limit.
- Extract the "response" string from the result extras (if present) and pass it to
  parseUpiResponse(). Handle resultCode and extras safely (either can be undefined). Update the
  pending entry by txnRef with the result.
- PhonePe not installed / launch fails → user-friendly error, no crash, entry marked "failed".
- Unique txnRef for every payment (timestamp + random).
- No result or "unknown" → on Receipt, ask "Did the payment go through?" [Yes] [No] and save the
  answer to history.
- On app start: if any entry is still "pending" (the app was killed while PhonePe was open), show
  "Did the payment go through?" for it and save the answer.
- "Yes" on the Confirm screen now calls the real launchPhonePe().
- A DEBUG section in Settings (only in __DEV__) showing the last intent's raw resultCode + extras.
- Delete the M0.5 spike: app/dev-upi.tsx, lib/devUpiSpike.ts, its test, its strings and the link
  on Home.
```

**Done (you, on the phone)**
- [ ] Add a **second account's** UPI ID as a payee in Settings (your account at another bank, or a
  family member who sends it back). Not your own PhonePe account
- [ ] "<that payee> ko 1" → Confirm → Yes → PhonePe opens with **name and ₹1.00 prefilled**
- [ ] Check the payee's real name shown in PhonePe, enter your PIN
- [ ] Back in the app, Receipt shows the correct status
- [ ] Press back on the PIN screen → "Failed" or the "Did the payment go through?" question
- [ ] Tap "Yes" twice quickly → PhonePe opens only once
- [ ] Start a payment, then kill FlowPay from recent apps while PhonePe is open. Reopen FlowPay →
  "Did the payment go through?"

**This was the biggest risk.** The M0.5 spike already showed how PhonePe handles our intent, and
the decision step picked a fallback if needed. If M5 behaves differently from the spike, stop and
compare with the spike results before changing code.

---

## M6 — Wire everything together (server + voice)

```
Do M6: remove the fake parser and connect the real flow.

1. lib/api.ts: POST {EXPO_PUBLIC_API_URL}/parse, 12 sec timeout, validate the response with Zod
   (amount: { kind: "paise", paise } | { kind: "last" }; until M7, treat "last" like NO_AMOUNT).
   Messages for every failure:
   NO_AMOUNT → "How much do you want to send?", NO_NAME → "Who do you want to pay?",
   network/AI_FAILED → "Couldn't understand that, please try again."
2. Home → api.parse → matchPayees → (none: contacts hint) → rules → Confirm.
   Name found in contacts but no payee → "No UPI ID saved for Mummy" + a button to Settings.
3. expo-speech: when the Confirm screen opens, say "Send 500 rupees to Mummy?".
   Speak the reason on a red card too. Confirmation stays tap-only.
4. Loading state while the server is thinking.
5. Delete lib/fakeParse.ts.
```

**Done**
- [ ] Say "Mummy ko paanch sau bhejo" with the Gboard mic → Confirm card + voice, then tap Yes
- [ ] Dictate with the Gboard **Hindi** keyboard ("मम्मी को ५०० भेजो") → correct Confirm card
- [ ] Stop the laptop server → "Couldn't understand that" and nothing proceeds
- [ ] "Mummy ko bhejo" (no amount) → "How much do you want to send?"

---

## M7 — "Same as last time" + polish

```
Do M7:
1. lib/history.ts already exists (M3). Check that corrupt data never crashes the app.
2. "Same as last time" (spoken as "pichhli baar jitna" / "utna hi" / "same as last time"): the
   server's AI returns amountText "LAST" (update the system prompt + tests), and the server maps it
   to amount { kind: "last" }. The /parse contract doesn't change. The substring guard exempts only
   this exact marker. The phone uses the amount of that payee's last successful payment.
   No previous payment → "No previous payment found. How much do you want to send?"
3. History list on Home, "Share" on Receipt (text receipt via React Native's Share API).
4. Go through every case in the "If something goes wrong" table in docs/ARCHITECTURE.md and build
   whatever is missing.
5. Tests for any new pure logic.
```

**Done**
- [ ] Send ₹1 to your test payee, then "<that payee> ko pichhli baar jitna" → Confirm for ₹1
- [ ] Ran every case from the "If something goes wrong" table once on the phone

---

## M8 — Demo prep: Vercel + APK + in-app mic

Do this milestone as three short sessions.

**M8a — Server on Vercel**
```
M8a: deploy apps/server on Vercel. M0 already made it zero-config ready (src/index.ts with
`export default app`, listen only when not on Vercel); check Vercel's current Express docs that
nothing else is needed.
Add app.set("trust proxy", 1) so express-rate-limit sees the real client IP behind Vercel's proxy.
Note in PROGRESS.md: the in-memory rate limit is per instance, so the real cost cap is the
OpenRouter key's credit limit.
I'll add the env variables in the Vercel dashboard myself; just tell me which ones.
Local `npm run dev` must keep working.
```
- [ ] `https://<your-project>.vercel.app/health` → ok
- [ ] curl /parse works against the Vercel URL
- [ ] Credit limit is set on the OpenRouter key

**M8b — In-app mic (needs a dev build)**
```
M8b: add expo-speech-recognition with hi-IN + en-IN. A big mic button on Home, live transcript
while speaking, auto "Next" when the user stops. If mic permission is denied, fall back to the
keyboard. This won't work in Expo Go: set up an EAS development build (eas.json, app.json plugin
config) and give me the exact commands.

Optional stretch (only if everything above works): voice "Yes" on Confirm. The mic starts only
after the TTS question has finished (expo-speech onDone). Strict word list: "yes", "haan",
"haan bhejo", "हाँ". Anything else does nothing. Tapping still works, and the persisted confirm
lock still applies. Update CLAUDE.md rule 8 if this is built.
```
- [ ] Installed the EAS build APK on the phone, full flow works with the mic

**M8c — Release APK**
```
M8c: create an EAS preview/release APK profile. EXPO_PUBLIC_API_URL must be the Vercel HTTPS URL.
Check package name in app.json, app name "FlowPay", placeholder icon.
Make sure the PhonePe launch works in the release build too (add Android package visibility
<queries> via a config plugin if needed).
```
- [ ] APK installed, full flow works on mobile data with Wi-Fi off
- [ ] Every item in `docs/TEST-CHECKLIST.md` ticked
