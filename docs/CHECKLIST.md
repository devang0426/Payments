# FlowPay: your test checklist (everything built up to 2026-10-19)

Go top to bottom; tick each box in VS Code. Each line says **what to do → what should happen**.
If something doesn't match, note the step number and what you saw or heard (a screenshot helps).
**Never paste UPI IDs, phone numbers or `.env` contents** into the chat.

---

## 0. Setup (once)

- [ ] 0.1 Laptop and phone on the same Wi-Fi/hotspot.
- [ ] 0.2 Server: `cd C:\Users\HP\Desktop\p6\apps\server` → `npm run dev` → "listening on port 3000".
- [ ] 0.3 App: `cd C:\Users\HP\Desktop\p6\apps\mobile` → `npx expo start` → open the **FlowPay** app
      (the development build you installed, **not Expo Go**) → scan the QR code. No rebuild is needed:
      everything new is JavaScript.
- [ ] 0.4 Settings → **Rehearsal mode ON** for sections 1–9 (no money moves; the orange banner shows).
- [ ] 0.5 Settings → payees: at least **two** (e.g. "Mummy" and "Papa"; for real payments later use a
      second account of your own). Saving asks for your fingerprint/PIN.
- [ ] 0.6 Settings → **Family helper** → Add your name + number → fingerprint/PIN → saved.
      Also try once and cancel the fingerprint → nothing saved.
- [ ] 0.7 Settings → **Ready check** → every row ✅ except "Rehearsal mode off" / "No rehearsal
      payments left" (expected while rehearsing). New rows: **Notifications allowed**, **Family helper saved**.

## 1. Voice-first Home (M16)

- [ ] 1.1 Open the app → it says "Who do you want to pay?" and the big mic pulses **without a tap**.
- [ ] 1.2 Stay silent → one spoken nudge ("I'm listening…") and the mic opens again.
- [ ] 1.3 Silent again → quiet; "Didn't catch that" + **📞 Call <you>** button; nothing spoken.
- [ ] 1.4 Tap the mic while it listens → it stops, **no** nudge.
- [ ] 1.5 Your words appear in quotes under the question while you speak.
- [ ] 1.6 "Type instead" shows the text box; "Payments" opens the list; ⚙ opens Settings.
- [ ] 1.7 Expo Go only (optional): the text box shows instead of the mic, typing still works.

## 2. One payment by voice (M12 + M16)

- [ ] 2.1 "Mummy ko paanch sau bhejo" → Confirm card ₹500 → it **asks aloud**, the mic opens → "haan"
      → "Opening PhonePe…" step → receipt with a big ✓ and it says "Done. 500 rupees sent to Mummy."
      (rehearsal: plus "No money moved").
- [ ] 2.2 "Mummy ko bhejo" → "**How much should I send to Mummy?**" → "teen sau" → card ₹300.
- [ ] 2.3 On a ₹500 card say "nahi, teen sau kar do" → a **new** ₹300 card; "haan" → done.
- [ ] 2.4 On a card say "nahi" → "Cancelled" is spoken **completely**; the card closes.
- [ ] 2.5 On a card say "ruko" → "Okay, tap the mic when you're ready"; card stays; tap the mic → "haan" → done.
- [ ] 2.6 On a card say nothing for 6 s, then "haan" late → nothing happens (late yes ignored); Yes button still works.
- [ ] 2.7 Double-tap **Yes** fast → only one payment (one receipt).
- [ ] 2.8 "Papa ko pichhli baar jitna" → card with Papa's last amount.

## 3. Several payments in one sentence (M14)

- [ ] 3.1 "Mummy ko 500 aur Papa ko 300" → Mummy ₹500 card → "haan" → receipt → **Home** →
      Papa ₹300 card opens **by itself** (after the receipt finished speaking) → "haan" → done.
- [ ] 3.2 Same sentence → on Mummy's card say "nahi" → "Cancelled"; Papa's card does **not** open.
- [ ] 3.3 Same sentence → tap **No** on Mummy's card → Papa's card opens next.
- [ ] 3.4 "Mummy ko 500 aur Papa ko 100 kam" → asks for the exact amount, no card.
- [ ] 3.5 DEV line "Agent steps" under the mic shows `1: pay` for "Mummy ko 500".

## 4. Hindi (M11)

- [ ] 4.1 Tap **EN** → it turns **हिं** → "मम्मी को पाँच सौ भेजो" → card ₹500 → it asks in Hindi → "हाँ" → done.
- [ ] 4.2 Ready check: if there's no Hindi voice, the app speaks English (never silent).

## 5. Questions it answers (M13 + M14)

- [ ] 5.1 "Papa ko is mahine kitna bheja?" → a card "Sent to Papa · This month" + spoken total.
- [ ] 5.2 "Papa ko kitna bheja?" → the **total** (not a list).
- [ ] 5.3 "aaj aur kitna bhej sakti hoon?" → "Left for today ₹…", spoken.
- [ ] 5.4 "mere last 3 payments dikhao" → 3 payments listed, spoken count.
- [ ] 5.5 "Sharma ji saved hain kya?" (not saved) → "Sharma ji isn't saved yet…". "Kya Mummy saved hai?" → "Mummy is saved."
- [ ] 5.6 "Limit hata do" → "I can't change the limits…", nothing else.
- [ ] 5.7 "x.fake@upi ko 500 bhejo" (any UPI ID) → "I can only pay saved payees…", **nothing sent** to the server.

## 6. Reminders (M13 + M17)

- [ ] 6.1 "1 tareekh ko Mummy ko 2000 bhejne ka yaad dilana" → reminder card → "haan" (or Save) → saved
      (allow notifications if asked). Settings → Reminders lists it.
- [ ] 6.2 On a reminder card tap **"Save, ring in 2 min (DEV)"** → the notification comes → tap it →
      Confirm card speaks + listens.
- [ ] 6.3 A reminder **without** an amount → tapping it opens Home, which asks "How much should I send to …?" at once.
- [ ] 6.4 Pay the same person the same amount twice (**rehearsal OFF** for this one, or skip) → the
      second receipt offers "🔔 Remind me every month on the …" → reminder card.

## 7. Family helper (M17)

- [ ] 7.1 Stop the laptop server → say anything twice → "Couldn't understand…" twice → it asks
      "**Should I call <you>?**" → "haan" → the phone's dialer opens with your number (nothing is called by itself).
- [ ] 7.2 Same, answer "nahi" → nothing opens. Start the server again.
- [ ] 7.3 "Mummy ko 4000" → red card ("at most ₹3,000") → **📞 Call <you>** button is there.

## 8. Memory and explanations (M15)

- [ ] 8.1 "Hindi mein bolo" → "Okay, I'll reply in Hindi" (in Hindi). Restart the app → still Hindi.
      "English mein bolo" → back to English.
- [ ] 8.2 "bolna band karo" → answers are only shown, the mic still opens; the **Confirm card still asks
      aloud**. Settings → Voice → turn "Speak replies" back on.
- [ ] 8.3 "Sunita matlab Mummy" (any new name) → "Add a name" card → **Add name** → fingerprint/PIN →
      "Saved". Then "Sunita ko 200" → card for **Mummy**.
- [ ] 8.4 Same, but cancel the fingerprint → nothing saved ("Sunita ko 200" → "I don't know Sunita").
- [ ] 8.5 "Papa matlab Mummy" → refused ("already matches another payee").
- [ ] 8.6 "Mummy ko 4000" → red card → back → "**Kyun block hua?**" → "₹4,000 to Mummy was stopped:
      one payment can be at most ₹3,000." (spoken too).
- [ ] 8.7 After 8.3: "Sunita ko 4000" → red → "Kyun block hua?" → also says "You said Sunita, which is saved as Mummy."
- [ ] 8.8 Wait 11 minutes → "Kyun block hua?" → "Nothing was stopped recently."

## 9. Guardrails (must never fail)

- [ ] 9.1 ₹3,001 → red card, no Yes button, "haan" does nothing.
- [ ] 9.2 Payments adding up to more than ₹5,000 today → red card with "Send ₹X instead?" → "haan" → a
      **new** card for ₹X that asks again.
- [ ] 9.3 A payee added just now → ₹600 → red ("new payee: at most ₹500 for 24 h").
- [ ] 9.4 A name that isn't saved → "I don't know X yet", no card.
- [ ] 9.5 Laptop server off → "Couldn't understand that, please try again.", never a card.

## 10. Real PhonePe (rehearsal OFF, ₹1 to your second account)

- [ ] 10.1 Settings → Rehearsal **OFF** → "Mummy ko 1 rupaya" → "haan" → PhonePe opens prefilled →
      approve → back in FlowPay: ✓ "Done", spoken.
- [ ] 10.2 Open PhonePe from a card, press **back** on the PIN screen → FlowPay: "Did the payment go
      through?" (or Failed) — no money moved.
- [ ] 10.3 Open PhonePe from a card, then **swipe FlowPay away** from recent apps, finish or cancel in
      PhonePe → open FlowPay → it asks "Did the payment go through?".
- [ ] 10.4 Settings → **Clear rehearsal payments**.

## 11. Privacy

- [ ] 11.1 Laptop server window: only lines like `agent: step=1 tools=prepare_payment … -> pay` —
      no names, amounts, UPI IDs or sentences.

## 12. Release (no laptop needed afterwards)

- [ ] 12.1 `cd apps\server` → `npx vercel@latest --prod` → `npm run eval -- https://<your-url> --agent` → GATE: PASS.
- [ ] 12.2 Release APK: DEPLOY.md step 4 → install → Wi-Fi off, mobile data on → sections 1–3 quickly.

## 13. Add a payee by scanning their UPI QR (needs the NEW development build, or Expo Go)

- [ ] 13.0 Rebuild first: `cd apps\mobile` → `npx eas-cli@latest build --platform android --profile development`
      → install the new APK. (In the old build the scan button just says "not available".)
- [ ] 13.1 Settings → Add payee → **📷 Scan UPI QR code** → allow the camera → point at a UPI QR (your
      own PhonePe "Receive money" QR works) → back on the form: UPI ID filled, name filled (if empty),
      a note "Filled in from the QR code. Check the name and UPI ID…".
- [ ] 13.2 Change the name to what she will say ("Doodhwala") → **Save** → fingerprint/PIN → saved.
      Then "Doodhwale ko 1 rupaya" → card for that payee (new payee: ₹500 cap for 24 h).
- [ ] 13.3 A shop's QR → the note also says "This is a shop's QR code."
- [ ] 13.4 Scan something that isn't a UPI QR (a website QR) → "That isn't a UPI payment QR code…",
      the camera keeps scanning; **Cancel** → nothing changed.
- [ ] 13.5 Edit an existing payee → scan a different QR → note about the ₹500 / 24 h limit → **don't
      save** (back) → the payee is unchanged.
- [ ] 13.6 Deny the camera once → "FlowPay can't use the camera…" + "Open phone settings"; typing still works.
- [ ] 13.7 A QR with an amount in it (a shop's "pay ₹500" QR) → only the UPI ID and name are used; no amount anywhere.

## 14. On her phone (with her)

- [ ] 14.1 PhonePe: turn on **fingerprint/face instead of the UPI PIN** if her bank supports it
      (else UPI Lite for small payments, or UPI Circle with you approving). Set PhonePe as the default UPI app.
- [ ] 14.2 Install the release APK; add her payees, **scanning each one's UPI QR** (section 13),
      fingerprint/PIN; add **you** as Family helper.
- [ ] 14.3 Settings → Voice: reply language as she likes; Ready check all ✅; Rehearsal OFF and cleared.
- [ ] 14.4 Let her try once with ₹1 while you watch: open → "Doodhwale ko 1 rupaya bhejo" → "haan" → fingerprint in PhonePe.
