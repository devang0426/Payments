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
| 1 | Input | Phone | Speak (keyboard mic first, in-app mic later) or type |
| 2 | Parse (AI) | Server | Extract name and amount from text. Amount converted to paise by code |
| 3 | Resolver | Phone | Spoken name → saved payee (name + aliases) → UPI ID. Contacts are only used to say "No UPI ID saved for X" |
| 4 | Guardrails | Phone | Check limits and stop mistakes |
| 5 | Confirm | Phone | Card + spoken "Send it?", then a **tap** on "Yes", or a strict spoken "Yes" / "Haan" (development/release build only) |
| 6 | UPI intent | Phone | Save a `pending` history entry, then open PhonePe directly with everything prefilled |
| 7 | Result | Phone | Receipt and history (for "same as last time"); pending entries are resolved on app start |

## Where data lives (privacy)

| Data | Where | Sent to server or AI? |
|---|---|---|
| Spoken/typed text | Phone → server → AI | Yes, text only |
| Voice audio (in-app or keyboard mic) | The phone's speech service (Google) turns it into text | ❌ FlowPay's server never gets audio |
| Contacts (names, numbers) | Phone only | ❌ Never |
| UPI IDs (saved payees) | Phone only: added in Settings, stored in SecureStore (never in a file) | ❌ Never |
| UPI PIN | Inside PhonePe only | ❌ Our app never sees it |
| Payment history | Phone (local) | ❌ |
| OpenRouter key | Server only | ❌ Not on the phone |

## If something goes wrong

| Situation | What the app does |
|---|---|
| Name matches two payees | Shows a "Which Mummy?" list |
| Name not found among payees | "No UPI ID saved for Mummy" (contacts only decide this wording) |
| Amount not understood | "How much do you want to send?" |
| AI returns a name or amount that isn't in the text | Treated as not understood; nothing proceeds |
| Over ₹3,000, or daily limit reached | Red card + reason; PhonePe does not open |
| Server or internet down | "Couldn't understand that, please try again." Money never moves |
| No result from PhonePe | "Did the payment go through?" [Yes] [No] |
| App killed while PhonePe was open | The `pending` entry survives; on next start: "Did the payment go through?" |
| "Same as last time" but no earlier successful payment to that person | "No previous payment to Mummy found. How much do you want to send?" |
| Payment history can't be read | Red card on every payment until it's cleared in Settings (a backup copy is kept) |
| No UPI app opens (PhonePe not installed) | Receipt shows Failed + "nothing was paid"; no money moved |
| Payee deleted while the Confirm card is open | "This payee no longer exists"; no Yes button |

**Design rule:** the AI only understands (name + amount). Deciding and executing happen on the
phone, and money only moves with your PIN. Even if the AI makes a mistake, the confirm card and
the real name shown in PhonePe will catch it.

## UPI intent risk

There is no official NPCI or PhonePe rule we could find, but developers widely report that UPI apps
(PhonePe, Google Pay, Paytm) reject payments started by another app's intent to **personal
(non-merchant) UPI IDs**, with errors like "Maximum limit exceeded" or "Risk threshold exceeded",
sometimes only above a small amount. So ₹1 may work while ₹500 fails. Whether PhonePe returns a
`response` string in the intent result is also undocumented.

That's why the **M0.5 spike** tests a real intent right after M0 (₹1, ₹101 and ₹500, with and
without `tr`, to a second account). If normal amounts fail, one fallback is chosen before M4:

1. The payee uses a **merchant UPI ID** (e.g. PhonePe Business). Same flow, no code change.
2. **Copy UPI ID + open PhonePe**: the user pastes the ID and types the amount; the app records the
   payment as "unknown".
3. **QR code** on the Confirm screen (only useful when scanned from another phone).

**Coming later** (same architecture): agent tools on the server (budget, history, scam check),
family alerts on Mom's phone, and a Swiggy MCP. The phone side stays as it is.

## Tech stack

Everything is lightweight: only Node and Git on the laptop, no Android SDK or Java.

| Layer | Choice | Why |
|---|---|---|
| App | Expo SDK 57 (React Native) + TypeScript, Expo Router | One codebase, no Android tooling on the laptop |
| Styling | React Native `StyleSheet` + `lib/theme.ts` | No extra build config; plenty for 4–5 screens |
| Contacts | expo-contacts (new class-based API in SDK 57; the old `*Async` API only via `expo-contacts/legacy`) | Only to tell "contact exists but no UPI ID saved" |
| Opening the UPI app | expo-intent-launcher (included in Expo Go) | Opens PhonePe directly. The result **may** include PhonePe's response in `extra`; this is undocumented and is checked in the M0.5 spike. No response = "unknown" |
| Spoken replies | expo-speech | The phone's built-in TTS, free |
| Mic | In-app mic (expo-speech-recognition, en-IN or hi-IN) in development/release builds; keyboard (Gboard) mic in Expo Go | Only text reaches FlowPay. Hindi recognition produces Devanagari text |
| Local storage | expo-secure-store (payees), AsyncStorage (history, incl. pending entries) | Sensitive data stays on the phone |
| Validation | Zod | Check the server response, stored payees and history |
| Server | Node + Express + TypeScript | Only the OpenRouter call; keeps the key off the phone. Vercel deploys it with zero config (`export default app`) |
| AI | OpenRouter, a fast model with JSON output | Copy the name + amount text verbatim from the input; the server rejects anything that isn't a substring of the input |
| Amount parser | Our own code (Hindi number words like "ek", "sau", "paanch sau", "dhai sau", "hazaar", "lakh", 11–99 words, Devanagari digits) | Don't trust the AI with money |
| Tests | Vitest (server), Jest (app logic) | Amount parser and name matching tests |

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
