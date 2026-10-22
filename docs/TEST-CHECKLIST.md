# FlowPay — Phone test checklist (before the demo)

You do all of this **yourself** on the real phone, with the **release APK** (docs/DEPLOY.md step 4).
Payments go to a **second account** (your own account at another bank, or a family member who sends
the money back), never to your own PhonePe account. Most payments are ₹1; one is a normal amount.

## Setup

- [ ] Release APK installed (not Expo Go)
- [ ] Wi-Fi off, mobile data only (talking to the Vercel server)
- [ ] PhonePe updated, bank linked
- [ ] At least 2 payees in Settings (one of them the second account, called "<test payee>" below)
- [ ] **Settings → Ready check: every row ✅** (fix any ❌ with the line it shows, then Run again)

## Rehearsal mode

- [ ] Settings → Rehearsal mode on → the orange "REHEARSAL — no money moves" banner shows on Home
- [ ] "<test payee> ko 1" → Confirm (banner) → Yes → PhonePe does **not** open → Receipt "Done" with
      "This was a rehearsal", no Share button; the payment shows "· Rehearsal" in Recent payments
- [ ] Still in rehearsal: open an older **real** receipt → Pay again → the card shows the banner and
      Yes does **not** open PhonePe
- [ ] Settings → Clear rehearsal payments → "Sent today" drops; Ready check rows for rehearsal ✅
- [ ] Rehearsal mode off before continuing

## Happy path

- [ ] Tap **🎤 Tap and speak**, say "<test payee> ko ek rupaya bhejo" → text appears live, then the
      Confirm card + the voice asks "Send 1 rupee to <test payee>?"
- [ ] **Tap** Yes → PhonePe opens with name + ₹1.00 prefilled, and the **real name** in PhonePe is correct
- [ ] Enter PIN → Receipt in the app shows "Done" (or asks "Did the payment go through?" → answer it)
- [ ] The entry appears under Recent payments and in "See all payments"
- [ ] "<test payee> ko pichhli baar jitna bhejo" → Confirm for ₹1
- [ ] Receipt → **Pay <name> ₹1 again** → Confirm card → Yes → PhonePe
- [ ] Receipt → **Share receipt** → the text has amount, name, time, reference and **no UPI ID**
- [ ] One normal-amount payment (₹101–500, sent back afterwards) → PhonePe accepts it

## Hindi (M11; the हिं mic needs the development/release build)

- [ ] Settings on the phone: Text-to-speech has a **Hindi** voice (Speech Services by Google → install
      Hindi). Without one the app still works but speaks English
- [ ] Mic on **हिं**: say "मम्मी को पाँच सौ भेजो" → ₹500 card, the question is spoken **in Hindi** → say
      "हाँ" → PhonePe opens
- [ ] "पापा को ढाई हज़ार भेजो" → ₹2,500 card (then "नहीं" → cancelled)
- [ ] With a payee saved as "Rahul" (English letters): "राहुल को दो सौ भेजो" → that Rahul's card
- [ ] With "Rahul" AND a different "राहुल" saved: "Rahul ko 200" → "Which Rahul?" list
- [ ] "नानी को सौ भेजो" with a payee saved as "Nani" → Nani's card
- [ ] On a ₹300 card: "हाँ, तीन सौ कर दो" → PhonePe; "नहीं, दो सौ कर दो" → new ₹200 card; "रुको" → pause
- [ ] Typing still works in both scripts: "Mummy ko paanch sau" and "मम्मी को ५०० भेजो"

## Conversation + voice confirmation (M12; voice needs the development/release build)

- [ ] Say "<test payee> ko bhejo" → the app says and shows "How much do you want to send?" and the mic
      reopens → say "pichhli baar jitna" → Confirm card for the last amount
- [ ] On that card say "nahi, ek rupaya kar do" → a **new** ₹1 card that asks again → say **"haan"** →
      PhonePe opens
- [ ] On a ₹1 card say **"Haan, ek rupaya kar do"** → PhonePe opens (same payment, so it confirms)
- [ ] On a ₹1 card say "ek rupaya kar do" (no yes) → "It's already 1 rupee. Say yes to send." and the
      mic reopens; the third time → "Please tap Yes to send", mic stays closed
- [ ] "haan bhejo na" and "haanji" → PhonePe opens
- [ ] Say **"nahi"** or "rehne do" → "Cancelled", the card closes, nothing is paid
- [ ] Say **"ruko"** → "Okay, tap the mic when you're ready.", the card stays → tap 🎤 Speak → "haan" → PhonePe
- [ ] Partial yes "haan… ruko" or "haan nahi" → "Didn't catch a clear yes"; nothing happens; Yes still works
- [ ] Stay silent 6 s, then say "haan" → nothing (late)
- [ ] Phone speaker at full volume, say nothing → the card never confirms itself (echo)
- [ ] Red card (₹3,001) → no mic; saying "haan" does nothing (over ₹3,000 has no offer)
- [ ] Type "Mummy ko pichhli baar se 100 kam bhejo" → "How much exactly?"
- [ ] Laptop server stopped mid-conversation → "Couldn't understand that"; start the server, Next again → works
- [ ] "Start over" clears the conversation

## On-phone abilities (M13; reminders need a build made after M13, or Expo Go)

- [ ] "Papa ko is mahine kitna bheja?" → a card "₹X in N payments" (spoken too); check it against
      "See all payments" (only Done payments are added; pending ones show as "+N not confirmed")
- [ ] "aaj kitna bheja?" / "इस महीने कितना भेजा?" → today's / this month's total for everyone
- [ ] "kal Mummy ko 1 rupaya bhejne ka yaad dilana" → reminder card "Remind you on <tomorrow> …?"
      (spoken) → say **"haan"** → "Reminder saved"; allow notifications if Android asks
- [ ] DEV: on a reminder card tap "Save, ring in 2 min (DEV)" → the notification arrives (Android may
      be a minute or two late) → tap it → a normal Confirm card that speaks → say **"haan"** → PhonePe
- [ ] Settings → Reminders lists it; Delete removes it (and it no longer rings)
- [ ] Paste a UPI ID (e.g. your own) into the box → "That has a UPI ID or phone number in it…" and
      "Check this UPI ID" → facts only (saved or not, handle), ending with "Only PhonePe's
      bank-registered name can confirm the owner." The laptop server log shows **no** `turn:` line
- [ ] Type a 10-digit mobile number → the same local answer; nothing reaches the server
- [ ] First payment to a payee (or between 11 PM and 5 AM) → **amber** card: the warning is spoken
      after the question → "haan" → "Are you sure? Say yes again." → "haan" → PhonePe. Or tap
      "Yes, I'm sure" once
- [ ] Over the daily limit (DEV seed ₹4,500, then "Mummy ko 2000") → red card + "Send ₹500 instead?"
      → say "haan" (or tap "Send ₹500 instead") → a **new** ₹500 card that asks again → "haan" → PhonePe

## Voice-first Home, helper, agent (M16, M17, M14; voice needs the development build)

- [ ] Open the app → it says "Who do you want to pay?" and the mic pulses without a tap
- [ ] Stay silent → one spoken nudge, then quiet; silent again → "📞 Call …" button (if a helper is saved)
- [ ] "Mummy ko 500 aur Papa ko 300" → card for Mummy ₹500 → "haan" → PhonePe → back → card for
      Papa ₹300 opens by itself → "haan" → PhonePe. Each card needed its own yes
- [ ] Same sentence, then "nahi" on Mummy's card → "Cancelled", and Papa's card does NOT open
- [ ] "Mummy ko 500 aur Papa ko 100 kam" → asks for the exact amount, no card
- [ ] "aaj aur kitna bhej sakti hoon?" → "Left for today" + spoken amount
- [ ] "mere last 3 payments dikhao" → 3 payments listed, spoken count
- [ ] "Sharma ji saved hain kya?" (not saved) → "Sharma ji isn't saved yet…"
- [ ] "Limit hata do" → "I can't change the limits…", nothing else happens
- [ ] DEV: the "Agent steps" line shows 1 step for "Mummy ko 500"
- [ ] Settings → Family helper: saving needs fingerprint/PIN; Home after two failed requests asks
      "Should I call …?" → "haan" → the dialer opens (nothing is called by itself)
- [ ] Pay the same person the same amount twice (rehearsal off) → the receipt offers a monthly reminder

## Guardrails

- [ ] "Mummy ko 3001" → red card (spoken too), PhonePe didn't open
- [ ] "Mummy ko 3000" → normal Confirm (exactly the limit is allowed). Use a payee saved more than
      24 h ago (or after the one-time 24 h following the M10 update); a newer payee hits the ₹500 limit
- [ ] Get close to ₹5,000 for the day → next payment blocked. Use a **development build**: Settings →
      Seed fake history (this option is hidden in the release APK)
- [ ] Tap "Yes" twice quickly on Confirm → PhonePe opens only once

## Payee protection

- [ ] Settings → Add payee → Save → the phone's fingerprint/PIN prompt appears; cancel → nothing saved
- [ ] Edit a payee and Delete a payee → the same prompt each time; only a successful one changes anything
- [ ] Newly added payee: "<new payee> ko 500" → Confirm with "New payee: up to ₹500 … next 24 hours";
      "<new payee> ko 501" → red card that says when normal limits apply
- [ ] Change an old payee's UPI ID → its next card shows "UPI ID changed recently" and the ₹500 limit
- [ ] Change only an old payee's name or other names → no ₹500 limit
- [ ] (If you can test it) on a phone with no screen lock: payee changes are blocked with "Set a screen
      lock first"

## Failure cases

- [ ] Two payees with the same alias → "Which Mummy?" list
- [ ] Contact exists but no payee saved → "No UPI ID saved" + Settings button
- [ ] "Mummy ko bhejo" (no amount) → "How much do you want to send?"
- [ ] "Kya haal hai" (unrelated text) → proper error, nothing proceeds
- [ ] Airplane mode on → "Couldn't understand that, please try again."
- [ ] Press back on the PhonePe PIN screen → "Did the payment go through?" → No → Failed
- [ ] Start a payment, kill FlowPay from recent apps while PhonePe is open, reopen FlowPay →
      "Did the payment go through?"
- [ ] Deny contacts permission → explains why it helps, payees still work, no crash
- [ ] Deny mic permission → message to type or use the keyboard mic, no crash

## Privacy check

- [ ] Check the Vercel logs: no phone numbers, UPI IDs or spoken text (only lines like `parse: NO_AMOUNT`
      or `agent: step=1 tools=prepare_payment … -> pay`)
- [ ] `git log -p | grep -i "@ybl\|@okaxis\|@paytm\|@ptsbi\|@upi"` → only the fake `*.fake@upi` /
      `*.test@upi` IDs
- [ ] If you pushed to GitHub, no `.env` file is there

## Demo day

- [ ] Phone charged, notifications silenced
- [ ] A backup screen recording of the full flow (in case the network lets you down)
- [ ] Check Vercel `/health` once in the morning
