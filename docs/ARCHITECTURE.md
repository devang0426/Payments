# FlowPay — Architecture

## At a glance

```
┌──────────────────────── PHONE (Android) ───────────────────────────┐
│                                                                     │
│  FlowPay app (Expo)                                                 │
│  ┌───────────────┐   ┌───────────────────┐   ┌──────────────────┐  │
│  │ 1. Input      │   │ 3. Resolver       │   │ 4. Guardrails    │  │
│  │ mic/keyboard  │   │ saved payees      │   │ ₹3,000/payment   │  │
│  │ "Mummy ko 500"│   │ (SecureStore)     │   │ ₹5,000/day       │  │
│  └──────┬────────┘   │ alias → UPI ID    │   │ payee must exist │  │
│         │ text only  │ (contacts: hint)  │   └────────┬─────────┘  │
│         ▼            └─────────▲─────────┘            ▼            │
│   ┌───────────┐                │            ┌──────────────────┐   │
│   │ API call  │── name, ₹ ─────┘            │ 5. Confirm card  │   │
│   └─────┬─────┘                             │ + voice "Send    │   │
│         │                                   │ it?" → tap "Yes" │   │
│         │                                   └────────┬─────────┘   │
│         │                                            ▼             │
│         │                                   ┌──────────────────┐   │
│         │                                   │ 6. Save pending, │   │
│         │                                   │ then UPI intent  │   │
│         │                                   └────────┬─────────┘   │
│         │                                            ▼             │
│         │                                   ┌──────────────────┐   │
│         │                                   │ PhonePe app      │   │
│         │                                   │ shows real name  │   │
│         │                                   │ → YOU ENTER PIN  │   │
│         │                                   └────────┬─────────┘   │
│         │                                            ▼             │
│         │                                   ┌──────────────────┐   │
│         │                                   │ 7. Result +      │   │
│         │                                   │ receipt + history│   │
│         │                                   └──────────────────┘   │
└─────────┼───────────────────────────────────────────────────────────┘
          │ HTTPS: text only ("Mummy ko 500 bhejo")
          ▼
┌───────────────── SERVER (laptop / Vercel) ──────────┐      ┌────────────┐
│ 2. /parse                                            │─────▶│ OpenRouter │
│ OpenRouter key lives here (not on the phone)         │◀─────│ (AI model) │
│ AI → {name:"Mummy", amountText:"500"}                │      └────────────┘
│ Amount parsed by code → 50000 paise                  │
└──────────────────────────────────────────────────────┘
          │
          ▼  UPI rails → NPCI → banks → money lands in Mom's account
```

## Who does what

| # | Part | Where | Job |
|---|---|---|---|
| 1 | Input | Phone | Speak (in-app mic in the development/release build, keyboard mic in Expo Go) or type |
| 1b | Pre-filter (M13) | Phone | Text with a UPI ID or an Indian mobile number is never sent: the phone answers by itself, and a UPI ID opens a facts screen (saved or not, since when, format, handle; never a safety verdict). `api.ts` checks again before every request |
| 2 | Understand (AI) | Server | `/turn` (Home, M12): one conversation step → one action (pay / set amount / set payee / show spending / create reminder / cancel / unknown) with spans copied from the user's words. `/parse` (one sentence) is kept for the Ready check and smoke test. Amounts converted to paise, periods ("is mahine") and reminder dates ("1 tareekh") to fixed values by code (`amount.ts`, `when.ts`) |
| 3 | Resolver | Phone | Spoken name → saved payee (name + aliases, also across scripts: "राहुल" ↔ "Rahul"; lookalikes always give a "Which X?" list) → UPI ID. Contacts are only used to say "No UPI ID saved for X" |
| 4 | Guardrails | Phone | Check limits and stop mistakes. Unusual payments (first to this payee, > 3× their median, 23:00–05:00 IST) make an **amber** card; over the daily limit the red card offers what's left today (M13) |
| 5 | Confirm | Phone | Card + spoken "Send it?", then a **tap** on "Yes" or a spoken yes ("haan", "haan, 300 kar do" if that's the card) decided by code (`lib/voiceConfirm.ts`; development/release build). A change ("nahi, 300 kar do") makes a new card; "nahi" cancels; "ruko" pauses. Amber needs a second yes or the tap "Yes, I'm sure"; a yes to the red card's offer opens a new card that asks again |
| 5b | Spending and reminders (M13) | Phone | "Papa ko is mahine kitna bheja?": the phone adds up its own history and shows/speaks the total; the server only sends back the period name. Reminders are stored structured (payeeId, paise, when) and ring as a local notification at 9 AM IST; the tap opens a normal Confirm card. A reminder never pays by itself |
| 6 | UPI intent | Phone | Save a `pending` history entry, then open the UPI app with everything prefilled (an implicit intent: Android opens the default UPI app, PhonePe on the demo phone, or shows a chooser) |
| 7 | Result | Phone | Receipt and history (for "same as last time"); pending entries are resolved on app start |

## Where data lives (privacy)

| Data | Where | Sent to server or AI? |
|---|---|---|
| Spoken/typed text | Phone → server → AI | Yes, text only: the last ≤ 6 things the user said in this conversation + the app's own fixed questions. Never the card's question (it names the saved payee) |
| The conversation itself | Phone memory only, cleared after a payment or cancel | Only as above, per request; the server keeps nothing |
| Voice audio (in-app or keyboard mic) | The phone's speech service (Google) turns it into text | ❌ FlowPay's server never gets audio |
| Contacts (names, numbers) | Phone only | ❌ Never |
| UPI IDs (saved payees) | Phone only: added in Settings, stored in SecureStore (never in a file) | ❌ Never |
| UPI PIN | Inside PhonePe only | ❌ Our app never sees it |
| Payment history | Phone (local) | ❌ |
| Spending totals (M13) | Worked out and shown on the phone | ❌ Never added to the conversation, so never sent back |
| Reminders (M13) | Phone: AsyncStorage (payeeId, paise, when) + a local notification | ❌ Local notifications only, no push server |
| Text with a UPI ID or phone number (M13) | Phone only | ❌ Caught before sending (`lib/prefilter.ts`) |
| OpenRouter key | Server only | ❌ Not on the phone |

## If something goes wrong

| Situation | What the app does |
|---|---|
| Name matches two payees | Shows a "Which Mummy?" list |
| Name not found among payees | "No UPI ID saved for Mummy" (contacts only decide this wording) |
| Amount not understood | "How much do you want to send?" (spoken; the mic reopens once in a dev/release build) |
| A relative amount ("100 kam", "double") | "How much exactly? Say the full amount" (no one works out a number) |
| On the card: speech that isn't clear, or the server is down | "Didn't catch a clear yes"; nothing happens; tap still works |
| On the card: the same payment said again without a yes ("300 kar do") | "It's already ₹300. Say yes to send." (twice at most, then "Please tap Yes") |
| AI returns a name or amount that isn't in the text | Treated as not understood; nothing proceeds |
| Over ₹3,000, or daily limit reached | Red card + reason; PhonePe does not open (checked when the card opens and again on Yes) |
| Server or internet down | "Couldn't understand that, please try again." Money never moves |
| No result from PhonePe | "Did the payment go through?" [Yes] [No] |
| App killed while PhonePe was open | The `pending` entry survives; on next start: "Did the payment go through?" |
| "Same as last time" but no earlier successful payment to that person | "No previous payment to Mummy found. How much do you want to send?" |
| Payment history can't be read | Red card on every payment until it's cleared in Settings (a backup copy is kept) |
| No UPI app opens (PhonePe not installed) | Receipt shows Failed + "nothing was paid"; no money moved |
| Payee deleted while the Confirm card is open | "This payee no longer exists"; no Yes button. If it happens after the card loaded, the re-check on Yes blocks it; nothing is written or launched |
| Payee's UPI ID changed while the Confirm card is open | The re-check on Yes blocks it ("UPI ID was changed after the card was shown"); nothing is sent |
| New payee, or a payee whose UPI ID changed less than 24 h ago | Info line on the card with the hours left; over ₹500 → red card |
| Someone tries to add, edit or delete a payee | The phone's fingerprint/PIN prompt first; no screen lock → payee changes are blocked |
| Rehearsal mode switched on or off after the payment was prepared | "Start it again from Home"; nothing is sent |
| Request to the server fails (network error or timeout) | One automatic retry; if that fails too, "Couldn't understand that" |
| The primary AI model errors (rate limit, downtime) | OpenRouter tries `OPENROUTER_FALLBACK_MODEL`, if one is set |

**Design rule:** the AI only understands (name + amount). Deciding and executing happen on the
phone, and money only moves with your PIN. Even if the AI makes a mistake, the confirm card and
the real name shown in PhonePe will catch it.

## UPI intent risk

There is no official NPCI or PhonePe rule we could find, but developers widely report that UPI apps
(PhonePe, Google Pay, Paytm) reject payments started by another app's intent to **personal
(non-merchant) UPI IDs**, with errors like "Maximum limit exceeded" or "Risk threshold exceeded",
sometimes only above a small amount. So ₹1 may work while ₹500 fails. Whether PhonePe returns a
`response` string in the intent result is also undocumented.

**Result (2026-10-16):** on the demo phone ₹1, ₹101 and ₹500 (with `tr`) all went through to a second
account, and PhonePe returned a status, so the receipt showed "Done" on its own. No fallback needed.

That's why the **M0.5 spike** tests a real intent right after M0 (₹1, ₹101 and ₹500, with and
without `tr`, to a second account). If normal amounts fail, one fallback is chosen before M4:

1. The payee uses a **merchant UPI ID** (e.g. PhonePe Business). Same flow, no code change.
2. **Copy UPI ID + open PhonePe**: the user pastes the ID and types the amount; the app records the
   payment as "unknown".
3. **QR code** on the Confirm screen (only useful when scanned from another phone).

**Agent (M12–M15, design in `docs/AGENT.md`; M12, M11 and M13 built):** It starts as a router
(one LLM call per turn) and becomes a stateless tool-calling agent; the phone keeps the data and runs
the tools, and private numbers are shown by the phone, never sent to the AI. Dropped from the earlier
idea list: server-side tools over payment history and server-pushed family alerts (they would break
the privacy rule), and a Swiggy MCP (off-mission).

## Tech stack

Everything is lightweight: only Node and Git on the laptop, no Android SDK or Java.

| Layer | Choice | Why |
|---|---|---|
| App | Expo SDK 57 (React Native) + TypeScript, Expo Router | One codebase, no Android tooling on the laptop |
| Styling | React Native `StyleSheet` + `lib/theme.ts`, theme from `FlowPay.html` (lavender, purple, pill buttons); Atkinson Hyperlegible via `@expo-google-fonts/atkinson-hyperlegible`, bundled and loaded by expo-font | No extra build config, no new native code (no development build rebuild); plenty for 4–5 screens |
| Contacts | expo-contacts (new class-based API in SDK 57; the old `*Async` API only via `expo-contacts/legacy`) | Only to tell "contact exists but no UPI ID saved" |
| Opening the UPI app | expo-intent-launcher (included in Expo Go) | Implicit VIEW intent: the default UPI app (PhonePe on the demo phone) opens prefilled. PhonePe returned a status in the payment test; no response = "unknown" |
| Spoken replies | expo-speech: English (en-IN), or Hindi (hi-IN) when the mic is हिं and a Hindi voice is installed (M11) | The phone's built-in TTS, free. Screen text stays English |
| Mic | In-app mic (expo-speech-recognition, en-IN or hi-IN) in development/release builds; keyboard (Gboard) mic in Expo Go | Only text reaches FlowPay. Hindi recognition produces Devanagari text |
| Local storage | expo-secure-store (payees), AsyncStorage (history, incl. pending entries) | Sensitive data stays on the phone |
| Validation | Zod | Check the server response, stored payees and history |
| Server | Node + Express + TypeScript | Only the OpenRouter call; keeps the key off the phone. Vercel deploys it with zero config (`export default app`) |
| AI | OpenRouter, a fast model with JSON output | Copy the name + amount text verbatim from the input; the server rejects anything that isn't a substring of the input |
| Amount parser | Our own code (Hindi number words in Latin and Devanagari script: "paanch sau" / "पाँच सौ", "dhai hazaar" / "ढाई हज़ार", 1–99 words, lakh, Devanagari digits) | Don't trust the AI with money || Tests | Vitest (server), Jest (app logic) | Amount parser and name matching tests |

## From development to demo

| Stage | How the app runs | Where the server runs |
|---|---|---|
| Development | Expo Go (`npm run start:go`, no in-app mic) or the EAS development build (`npx expo start`) | Laptop (`npm run dev`), same Wi-Fi or hotspot |
| Development build | `eas build --profile development` → install APK (in-app mic + voice Yes) | Laptop or Vercel |
| Demo day | `eas build --profile preview` APK (like a normal app) | Vercel (HTTPS), URL set with `eas env:create` |

Step-by-step commands: `docs/DEPLOY.md`.

By default, an Android release APK won't talk to plain `http://` servers. That's why the demo APK
uses the server on Vercel. During development, Expo Go works fine with the laptop's `http://` server.

## Accounts and tools

| What | Needed? |
|---|---|
| Node + Git (laptop) | ✅ |
| Expo Go app (phone) | ✅ |
| OpenRouter key (with a credit limit set in the dashboard) | ✅ |
| A second UPI account to receive test payments (your other bank, or family who send it back) | ✅ from M0.5 |
| Expo account (for EAS builds) | ✅ when building the APK |
| Vercel | ✅ before the demo |
| PhonePe (on the phone, bank linked) | ✅ |
| Supabase, Railway, Razorpay | ❌ Not now |

See "Repo layout" in `CLAUDE.md` for the folder structure.
