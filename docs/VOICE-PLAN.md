# FlowPay — Voice-only plan (for Mummy)

Agreed 2026-10-19 ("go ahead with the phases"). **Built: M16** (2026-10-19; defaults: screen text
English, mic opens by itself; the app shortcut is not done yet) and **M17** (2026-10-19; the voice
offer to call is made only after two *failed requests*, not after silence; WhatsApp share skipped). The user's goal: FlowPay is for their mother, who struggles with
passwords and UPI apps. She should only *speak* and *listen*; the app does the rest. The hard rules in
CLAUDE.md still apply (confirm card + yes, PIN/approval only inside PhonePe, nothing private to the
server). This file supersedes the "UI changes = theme only" decision **once the user agrees to it**.

## How Mummy would actually use it

| She says / does | FlowPay does |
|---|---|
| Opens FlowPay (or taps the home-screen shortcut "Paise bhejo") | Says "Kise paise bhejne hain?" and is **already listening**. No tap. |
| "Doodhwale ko 600 bhejo" | Big card: ₹600 → Ramesh Doodhwala, spoken: "Ramesh Doodhwala ko 600 rupaye bhejun?" Mic opens. |
| "Haan" | PhonePe opens prefilled. She touches the fingerprint sensor (no PIN, see Phase 1). |
| Comes back from PhonePe | "600 rupaye chale gaye." The screen shows a big green tick. |
| "Bai ko bhejo" | "Kitne bhejun?" Then "2000" → card → "haan". |
| "Kitna bheja is mahine?" | Speaks the total from the phone's own history. |
| A payee is new, or over the limit | Red card, spoken reason, and a big **"Call Beta"** button (Phase 3). |
| The 1st of the month (reminder) | Notification "Doodhwale ka din hai". Tapping it speaks the card and listens. |
| Gets confused / silence | "Main sun rahi hoon. Bolo, kise bhejna hai?" once, then goes quiet with a big mic. |

What makes it feel agentic: it **starts listening by itself, asks only for what's missing, keeps
going without taps, speaks back the result, remembers what she pays regularly, and gets help** (calls
the family member) instead of showing an error.

## Phase 0 — Fix what broke on the phone (first)

The user saw problems on the development build ("UI is messed"). List them here with screenshots,
fix them first. No new features in this phase.

## Phase 1 — Set up PhonePe for her (no code, ~30 min with her phone)

FlowPay can never see or skip the UPI approval (rule 7). These PhonePe/UPI features make that step
easy for her. Check each one on her phone and bank; availability varies.

1. **Fingerprint / face instead of the UPI PIN.** NPCI allowed on-device biometric approval for UPI
   from 8 Oct 2025 (optional, user turns it on). Turn it on in PhonePe if her bank supports it.
2. **UPI Lite** (small payments without a PIN, about ₹1,000 per payment, wallet up to ₹5,000). Good
   for doodhwala / sabziwala. Check that a FlowPay intent payment can use it.
3. **UPI Circle, partial delegation** (alternative): she is the secondary user, the family member is
   the primary and approves each payment on their own phone. She never needs a PIN, and every payment
   gets a second pair of eyes (strong scam protection). Test whether an intent from FlowPay works
   from a delegate account.
4. Set PhonePe as the default UPI app ("Always") so no chooser appears.

Record what worked in PROGRESS.md. Pick one of 1–3 as her normal way to approve.

## Phase 2 — M16 Voice-only Home (the big change)

One screen, voice first. The screens and rules behind it stay (Confirm, Choose, Receipt, Settings,
locks, rules.ts); what changes is Home and how the screens look and talk.

1. **Home = one big mic.** Huge round button in the centre (tap anywhere to talk), the app's last
   question in big text, the live transcript under it. Recent payments and the text box move behind a
   small "Type instead" link. Settings move behind a small gear (the family member's area; payee
   changes already need fingerprint/PIN).
2. **Auto-listen.** The app speaks its greeting and opens the mic when Home opens (and after every
   question, as now). Listen window on Home: 8 s (older speakers pause longer; research below). The
   Confirm window stays 5 s unless rule 8 is changed on purpose.
3. **Clear states, each spoken and shown:** Listening (pulsing) → Thinking → Asking → Card → Opening
   PhonePe → Done / Not done / Blocked. Reuse the Listening / Opening PhonePe / Over limit mock-ups in
   `FlowPay.html` (rolled back on 2026-10-19 when the request was "theme only").
4. **Result spoken after PhonePe:** "600 rupaye chale gaye" / "Payment nahi hua, phir se karein?".
5. **Gentle repair:** one re-ask with an example ("Jaise: Mummy ko 500 bhejo"), then quiet + big mic.
   Never a wall of text.
6. **Bigger everything:** card amount ≥ 56 pt, name ≥ 32 pt, the payee's initial in a big circle.
7. **Android app shortcut** (long-press the icon → "Paise bhejo") that opens straight into listening.
8. Expo Go keeps working with typing (no mic there).

Decisions needed (user):
- On-screen text in **Hindi** for her? CLAUDE.md says all UI text is English; spoken replies are
  already Hindi. Changing it touches every screen's strings.
- Start listening on app open: yes/no (some people find a mic that opens by itself scary).

## Phase 3 — M17 Helper + proactive

1. **"Call Beta" button** on red cards, "not clear" twice, and in Settings: a `tel:` intent to one
   trusted number saved on the phone (never sent anywhere). Spoken: "Beta ko call karun?" → yes →
   dialer opens.
2. **Reminders open by voice:** tapping a reminder notification speaks the card and listens
   (built in M13 as a tap card; make it voice first).
3. **Regulars:** "Doodhwale ko har mahine wala" = the amount of the last payment to that payee (exists
   as "pichhli baar jitna"); suggest a monthly reminder after the 2nd same-amount payment.
4. Optional: after each payment, offer "Beta ko batayein?" → WhatsApp share intent with the
   phone-made text (user-controlled, nothing goes to our server).

## Phase 4 — M14 tool-calling agent + M15 memory (already planned)

As in `docs/PROMPTS.md`. Adds "Mummy ko 500 aur Papa ko 300" (two cards, one after another, each with
its own yes), "Maa matlab Mummy" aliases (fingerprint), "Kyun nahi gaya?" explanations. Do this after
Phase 2, because for her the voice loop matters more than a smarter model.

## Order

Phase 0 → Phase 1 (with her phone) → M16 → M17 → M14 → M15. One milestone per session, as usual.

## Sources (2026-10-19)

- UPI biometric approval: [Business Today](https://www.businesstoday.in/amp/personal-finance/news/story/no-more-pins-upi-to-get-face-and-fingerprint-authentication-for-faster-safer-online-payments-497815-2025-10-11),
  [Croma](https://www.croma.com/unboxed/upi-payments-to-go-biometric-with-face-and-fingerprint-authentication)
- UPI Circle: [PhonePe](https://business.phonepe.com/articles/upi-circle-what-it-is-how-it-works-and-who-can-use-it),
  [Razorpay](https://razorpay.com/blog/what-is-upi-circle/)
- UPI Lite limits: [ClearTax](https://cleartax.in/s/what-is-upi-lite) (figures vary by source; check in PhonePe)
- Voice design for older adults (slower pacing, longer pauses, confirmations lower anxiety, help with
  repair): [Co-designing VUIs for older adults](https://arxiv.org/html/2409.08449v1),
  [Older users and dialogue systems](https://ar5iv.arxiv.org/html/1902.04393)
