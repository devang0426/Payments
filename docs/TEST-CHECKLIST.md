# FlowPay — Phone test checklist (before the demo)

You do all of this **yourself** on the real phone, with the **release APK** (docs/DEPLOY.md step 4).
Payments go to a **second account** (your own account at another bank, or a family member who sends
the money back), never to your own PhonePe account. Most payments are ₹1; one is a normal amount.

## Setup

- [ ] Release APK installed (not Expo Go)
- [ ] Wi-Fi off, mobile data only (talking to the Vercel server)
- [ ] PhonePe updated, bank linked
- [ ] At least 2 payees in Settings (one of them the second account, called "<test payee>" below)

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
- [ ] Switch the mic to **हिं** and say "मम्मी को पांच सौ भेजो" (or type "मम्मी को ५०० भेजो") →
      correct Confirm card (then tap No)

## Voice "Yes" (strict)

- [ ] On the Confirm card, after the question is spoken, say **"Haan"** → PhonePe opens (same as tapping)
- [ ] Say something else ("hello", "no") → nothing happens; the hint says tap "Yes, send"
- [ ] Don't say anything → nothing happens; the Yes button still works

## Guardrails

- [ ] "Mummy ko 3001" → red card (spoken too), PhonePe didn't open
- [ ] "Mummy ko 3000" → normal Confirm (exactly the limit is allowed)
- [ ] Get close to ₹5,000 for the day → next payment blocked. Use a **development build**: Settings →
      Seed fake history (this option is hidden in the release APK)
- [ ] Tap "Yes" twice quickly on Confirm → PhonePe opens only once

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

- [ ] Check the Vercel logs: no phone numbers, UPI IDs or spoken text (only lines like `parse: NO_AMOUNT`)
- [ ] `git log -p | grep -i "@ybl\|@okaxis\|@paytm\|@ptsbi\|@upi"` → only the fake `*.fake@upi` /
      `*.test@upi` IDs
- [ ] If you pushed to GitHub, no `.env` file is there

## Demo day

- [ ] Phone charged, notifications silenced
- [ ] A backup screen recording of the full flow (in case the network lets you down)
- [ ] Check Vercel `/health` once in the morning
