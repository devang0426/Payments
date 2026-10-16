# FlowPay

Voice UPI payments for Android, built as a demo. Say **"Mummy ko paanch sau bhejo"** ("send 500 to
Mom"); FlowPay understands it, checks your limits, shows a confirm card that asks "Send 500 rupees
to Mummy?", and on **Yes** opens PhonePe with everything prefilled. You enter your own UPI PIN in
PhonePe; FlowPay never sees it.

**Safe by design**
- The AI only extracts the name and the amount *text*; our own code turns the amount into integer
  paise. The server rejects anything the AI didn't copy from what you said.
- Limits on the phone: ₹3,000 per payment, ₹5,000 per day (IST). A payment that may have gone
  through ("pending"/"unknown") still counts.
- Nothing is sent without the confirm card and a Yes; a Yes works once per payment.
- Contacts, UPI IDs and payment history never leave the phone. The server only receives the text.

## Run it (development)

Needs Node ≥ 22.13 and Git on the laptop, and the phone on the same Wi-Fi or hotspot.

```
# 1. server (laptop)
cd apps/server
npm install
copy .env.example .env        # then put your OpenRouter key + model in .env (never in chat)
npm run dev                   # http://localhost:3000/health → {"ok":true}

# 2. app
cd apps/mobile
npm install
copy .env.example .env        # set EXPO_PUBLIC_API_URL=http://<laptop Wi-Fi IP>:3000
npm run start:go              # scan the QR with Expo Go (keyboard mic)
# or: npx expo start          # with the FlowPay development build (in-app mic + voice Yes)
```

Then in the app: **Settings → Add payee** (name, UPI ID, other names like "mumma, maa"), and type or
say a payment on Home.

If the phone can't reach the laptop: allow Node through the Windows firewall (ports 3000 and 8081 on
the Private profile) and check the laptop's IP with `ipconfig`.

## Tests

```
cd apps/server && npm test             # Vitest: amount parser, /parse, OpenRouter client
cd apps/server && npm run smoke        # live check against a running server + the real AI
cd apps/mobile && npm test             # Jest: matching, limits, UPI link, storage, flow, voice
```

## Deploy and demo

Vercel (server), the EAS development build, the release APK and the real-payment test are your
steps: see **[docs/DEPLOY.md](docs/DEPLOY.md)**. Before the demo, go through
**[docs/TEST-CHECKLIST.md](docs/TEST-CHECKLIST.md)** on the release APK.

## Project files

| File | Purpose |
|---|---|
| `CLAUDE.md` | Hard rules and conventions (Claude Code reads it every session) |
| `docs/ARCHITECTURE.md` | Design, data privacy, failure cases |
| `docs/PROGRESS.md` | What was built, decisions, known issues, log |
| `docs/PROMPTS.md` | The milestone prompts M0–M8 |
| `docs/DEPLOY.md` | Your remaining steps: Vercel, EAS builds, real payments |
| `docs/TEST-CHECKLIST.md` | Phone checks before the demo |
| `apps/server` | Express + TypeScript: `POST /parse` (OpenRouter) |
| `apps/mobile` | Expo SDK 57 + Expo Router: the app |

## Secrets (do this yourself, never in chat)

- `apps/server/.env`: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (recommended `openai/gpt-4.1-nano`).
  Set a **credit limit** on the key in the OpenRouter dashboard: it's the real cap on API costs.
- `apps/mobile/.env`: only `EXPO_PUBLIC_API_URL` (it's bundled into the app, so no secrets).
- Both are gitignored. Real UPI IDs never go into any file: payees are added in the app's Settings
  and stored in SecureStore on the phone only.

## If you get stuck

- Error on the phone: give Claude the full Metro terminal log and a screenshot.
- Claude is going in circles: "Stop. Explain the cause first, then suggest a different approach."
- Something broke: check `git diff`, or go back to the last commit with `git checkout .`.
