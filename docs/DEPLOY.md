# FlowPay — Your remaining steps (deploy, builds, final test)

Everything in the code is done. These steps need **your** accounts, phone or bank, so only you can
do them. Do them in this order. Run every command from PowerShell in the folder shown.
Never paste keys into chat.

---

## 1. Put the server on Vercel (≈10 min)

You need a free Vercel account (vercel.com, sign in with GitHub or email).

```
cd C:\Users\HP\Desktop\p6\apps\server
npx vercel@latest login
npx vercel@latest
```
Answer the questions: **Set up and deploy?** Yes · **Link to existing project?** No ·
**Project name:** `flowpay-server` · **Directory:** `./` (press Enter) · keep the detected settings.

Add the two secrets (it asks for the value; paste it there, not in chat):
```
npx vercel@latest env add OPENROUTER_API_KEY production
npx vercel@latest env add OPENROUTER_MODEL production
```
For `OPENROUTER_MODEL` enter `openai/gpt-4.1-nano`.

Optional backup model, used by OpenRouter only if the first one fails (rate limit, outage). It must
also be a **non-reasoning** model. `qwen/qwen3-235b-a22b-2507` scored 9/10 in the M2 comparison (slower,
but a different provider than OpenAI). To check one first, put it in `apps/server/.env` as
`OPENROUTER_MODEL` for a moment and run `npm run smoke`.
```
npx vercel@latest env add OPENROUTER_FALLBACK_MODEL production
```
Then deploy for real:
```
npx vercel@latest --prod
```
It prints your URL, like `https://flowpay-server-xxxx.vercel.app`. Check it:
```
curl.exe https://<your-url>/health
npm run smoke -- https://<your-url>
```
Expected: `{"ok":true}` and **8/8 passed**.

- If you get **401** or a Vercel login page: Vercel dashboard → the project → Settings → Deployment
  Protection → turn it off for Production.
- `.env` is never uploaded (`.vercelignore`); the key only lives in Vercel's settings.
- Make sure the OpenRouter key has a **credit limit** (OpenRouter dashboard → Keys). That's the real
  cost cap.
- **After M14, deploy again** (`npx vercel@latest --prod` from `apps/server`): Home now talks to the
  new `/agent` endpoint. An older deployment doesn't have it, so every request would fail with
  "Couldn't understand that". Check it with `npm run eval -- https://<your-url> --agent`.

---

## 2. Development build with the in-app mic (≈20 min, mostly waiting)

Expo Go can't run the in-app mic or the voice "Yes". A development build is your own version of
Expo Go with them included. You need a free Expo account (expo.dev).

```
cd C:\Users\HP\Desktop\p6\apps\mobile
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --platform android --profile development
```
- `init` links the project to your account (it adds a project id to `app.json`; commit that).
- The build runs in Expo's cloud (10–20 min). At the end it shows a **QR code / link**: open it on the
  phone and install the APK (allow "install unknown apps" if Android asks).

Use it (laptop and phone on the same Wi-Fi/hotspot, server running locally):
```
cd C:\Users\HP\Desktop\p6\apps\server
npm run dev
```
```
cd C:\Users\HP\Desktop\p6\apps\mobile
npx expo start
```
Open the **FlowPay** app you just installed (not Expo Go) and scan the QR code from inside it.

> Still want Expo Go (no mic)? Use `npm run start:go` instead of `npx expo start`.

> **After the QR scan (2026-10-22): build again.** `expo-camera` is a native module, so a development
> build made before it can't scan (Settings → Add payee → Scan says "not available"; nothing crashes).
> Run the `build` command above once more and install the new APK. Expo Go can scan already.

> **After M13: build again.** M13 added `expo-notifications` (payment reminders), a native module.
> A development build made before M13 doesn't contain it: the app still works, but saving a reminder
> says "Reminders need notifications, which aren't available in this build". Run the `build` command
> above once more and install the new APK. Reminders also work in Expo Go (local notifications are
> supported there on Android).

---

## 3. The real payment test (when your bank is back)

In the app: Settings → add the **second account** as a payee (not your own PhonePe account).
Settings → DEV tools has the **Include tr** switch and the **Last PhonePe result**.

| # | Amount | Include tr | What to note |
|---|---|---|---|
| 1 | ₹1 | on | Paid? Receipt status? Last PhonePe result |
| 2 | ₹1 | off | same |
| 3 | ₹101 | on | same |
| 4 | ₹101 | off | same |
| 5 | ₹500 | on | same (family sends it back) |
| 6 | ₹500 | off | same |
| 7 | ₹1 | on | press **back** on the PIN screen instead of paying |

Send Claude the results (no UPI IDs). Claude then fills in "Spike results" in `docs/PROGRESS.md`
and decides whether `tr` stays on, and whether a fallback is needed if PhonePe blocks the larger
amounts.

---

## 4. Release APK for the demo (≈20 min, mostly waiting)

The release app talks to the **Vercel** server over HTTPS (a release build won't use the laptop's
`http://` address). Tell EAS the server URL once:
```
cd C:\Users\HP\Desktop\p6\apps\mobile
npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://<your-url> --visibility plaintext
npx eas-cli@latest build --platform android --profile preview
```
Install the APK from the link it prints. This is a normal app: no laptop needed.

**Never share this APK or the phone's data**: your payees (real UPI IDs) live in it on your phone.

---

## 5. Final check

Go through `docs/TEST-CHECKLIST.md` on the release APK with Wi-Fi off (mobile data only).

To practise without paying, turn on **Settings → Rehearsal mode**: the whole flow runs, PhonePe never
opens, and every screen shows "REHEARSAL — no money moves". Turn it off and tap **Clear rehearsal
payments** before the real demo; **Settings → Ready check** flags both if you forget.
