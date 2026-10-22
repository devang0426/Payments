// Confirm card. Never trusts the previous screen: it reloads the payee and history and runs the
// rules again. A failed rule = red card and no "Yes" button. "Yes" works once per txnRef.
// Voice (rule 8, docs/AGENT.md): after the question is spoken the mic opens for 5 s; lib/voiceConfirm
// decides what the speech means (confirm / change → new card / re-ask / cancel / pause / not clear).
// A spoken yes and the Yes button call the same locked yes().
// M13: an unusual payment (rules.ts paymentWarnings) makes an AMBER card: the warning is spoken after
// the question and confirming needs a second spoken yes or the tap "Yes, I'm sure". Over the daily
// limit, the red card offers what's left today ("Send ₹X instead?"): a yes or a tap opens a NEW card.
import { router, useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { CallHelperButton } from "@/components/CallHelper";
import { RehearsalBanner } from "@/components/RehearsalBanner";
import { Button, Card, Notice, Screen, Text, ui } from "@/components/ui";
import { sendTurn } from "@/lib/api";
import { addUserTurn, applyAction, turnsForServer, type ConversationState } from "@/lib/conversation";
import { resolvePayment } from "@/lib/flow";
import { formatRupees, lastFour, maskVpa } from "@/lib/format";
import type { Payee } from "@/lib/payees";
import { sendPayment, type BlockReason } from "@/lib/pay";
import { isRehearsalRef, launcherFor, txnRefFor } from "@/lib/rehearsal";
import { speechTexts, type SpeechLang } from "@/lib/speech";
import { speechLanguage } from "@/lib/speechLang";
import {
  DAILY_LIMIT_PAISE,
  cardTone,
  checkPayment,
  cooldownHoursLeft,
  dailyOfferPaise,
  newPayeeStatus,
  paymentWarnings,
  sentTodayPaise,
  type CardTone,
  type PaymentWarning,
  type RuleResult,
} from "@/lib/rules";
import {
  confirmLock,
  conversation,
  historyStore,
  lastOutcome,
  lastSpokenName,
  payeeStore,
  paymentQueue,
  rehearsal,
} from "@/lib/stores";
import { upiLauncher } from "@/lib/upiLaunch";
import { listenOnce, stopListening, voiceAvailable } from "@/lib/voice";
import { LISTEN_WINDOW_MS, decideVoice, type TurnOutcome, type VoiceDecision } from "@/lib/voiceConfirm";
import { strings } from "@/lib/strings";
import { colors, fontSize, fonts, spacing } from "@/lib/theme";

const s = strings.confirm;
const SETTLE_MS = 250; // after our own speech ends, before the mic opens (less echo)

type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "modeChanged" } // rehearsal mode was switched after this payment was prepared
  | { kind: "blocked"; reason: BlockReason } // the last-moment re-check in sendPayment said no
  | {
      kind: "ready";
      payee: Payee;
      amountPaise: number;
      rule: RuleResult;
      remainingPaise: number;
      used: boolean;
      tone: CardTone;
      warnings: PaymentWarning[]; // amber: why this payment is unusual
      offerPaise: number | null; // red over the daily limit: what's left today, whole rupees
      // Set while the payee is "new" (24 h after it was saved or got a new UPI ID).
      newPayee: { kind: "added" | "vpaChanged"; hours: number } | null;
    };

export default function ConfirmScreen() {
  const params = useLocalSearchParams<{ payeeId: string; amountPaise: string; txnRef: string }>();
  const txnRef = String(params.txnRef ?? "");
  const [state, setState] = useState<State>({ kind: "loading" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ payees }, { entries, corrupt }, used, rehearsalOn] = await Promise.all([
        payeeStore.load(),
        historyStore.load(),
        confirmLock.isUsed(txnRef),
        rehearsal.load(),
      ]);
      const payee = payees.find((p) => p.id === params.payeeId);
      if (cancelled) return;
      if (!payee || !txnRef) return setState({ kind: "missing" });
      if (!used && !launcherFor(txnRef, rehearsalOn, upiLauncher)) return setState({ kind: "modeChanged" });

      // Only plain digits are a valid amount; anything else is blocked by the rules.
      const amountPaise = /^\d{1,12}$/.test(String(params.amountPaise)) ? Number(params.amountPaise) : Number.NaN;
      const now = Date.now();
      const rule = checkPayment({ amountPaise, payee, history: entries, now, historyUnreadable: corrupt });
      const remainingPaise = Math.max(0, DAILY_LIMIT_PAISE - sentTodayPaise(entries, now));
      const status = newPayeeStatus(payee, now);
      const newPayee = status ? { kind: status.kind, hours: cooldownHoursLeft(status.msLeft) } : null;
      const warnings = rule.ok ? paymentWarnings({ payeeId: payee.id, amountPaise, history: entries, now }) : [];
      const tone = cardTone(rule, warnings);
      const offerPaise = dailyOfferPaise({ rule, history: entries, now });
      // M15 "Kyun block hua?": what the rules said, with the phone's own numbers.
      if (!rule.ok && !used) {
        const spokenName = lastSpokenName.for(payee.id);
        lastOutcome.set({
          kind: "blocked",
          reason: rule.reason,
          payeeName: payee.displayName,
          amountPaise: Number.isFinite(amountPaise) ? amountPaise : 0,
          sentTodayPaise: sentTodayPaise(entries, now),
          leftTodayPaise: remainingPaise,
          ...(newPayee ? { newPayeeHours: newPayee.hours } : {}),
          ...(spokenName ? { spokenName } : {}),
        });
      }
      setState({ kind: "ready", payee, amountPaise, rule, remainingPaise, used, newPayee, tone, warnings, offerPaise });
    })();
    return () => {
      cancelled = true;
    };
  }, [params.payeeId, params.amountPaise, txnRef]);

  // Spoken language: Hindi when the mic is हिं and a Hindi voice exists (M11), else English.
  const [speechLang, setSpeechLang] = useState<SpeechLang | null>(null);
  useEffect(() => {
    speechLanguage().then(setSpeechLang);
  }, []);
  const texts = speechLang ? speechTexts(speechLang) : null;
  const textsRef = useRef(texts);
  textsRef.current = texts;

  // Speak the question (or why it's blocked) once the card is ready.
  const ready = state.kind === "ready" ? state : null;
  const spoken =
    !ready || !texts
      ? null
      : ready.used
        ? null
        : !ready.rule.ok
          ? ready.offerPaise !== null
            ? `${texts.rules.OVER_DAILY} ${texts.offer(texts.rupees(ready.offerPaise))}`
            : ready.rule.reason === "OVER_DAILY"
              ? `${texts.rules.OVER_DAILY} ${texts.dailyRemaining(texts.rupees(ready.remainingPaise))}`
              : texts.rules[ready.rule.reason]
          : [
              texts.confirm(texts.rupees(ready.amountPaise), ready.payee.displayName),
              ...ready.warnings.map((w) => texts.warnings[w](ready.payee.displayName)),
            ].join(" ");

  // Voice (development/release build only). The mic opens on a card that can be confirmed (green or
  // amber, not used), or on a red card that offers an alternative. Never a confirm on red.
  const voiceOn = voiceAvailable();
  const canListen = !!ready && !ready.used && voiceOn && (ready.rule.ok || ready.offerPaise !== null);
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const yesRef = useRef<() => void>(() => {});
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const alive = useRef(true); // false once this card is closed, replaced or left
  const keepSpeaking = useRef(false); // a last line ("Cancelled") may finish after the card closes
  const listeningRef = useRef(false);
  const sendingRef = useRef(false);
  const lastSpoken = useRef("");
  const reasks = useRef(0);
  const amberStep = useRef<1 | 2>(1); // 2 after "Are you sure? Say yes again."
  // The conversation after a change, kept only if that change becomes a new card.
  const changedConversation = useRef<ConversationState | null>(null);

  function say(text: string, thenListen: boolean) {
    lastSpoken.current = text;
    Speech.stop();
    Speech.speak(text, {
      language: speechLang ?? "en-IN",
      onDone: () => {
        if (alive.current && thenListen) setTimeout(listenNow, SETTLE_MS);
      },
    });
  }

  async function listenNow() {
    const card = readyRef.current;
    if (!alive.current || listeningRef.current || sendingRef.current || !card || card.used) return;
    if (!card.rule.ok && card.offerPaise === null) return;
    listeningRef.current = true;
    setListening(true);
    setVoiceNote(null);
    const listenStartedAt = Date.now();
    const heard = await listenOnce({ timeoutMs: LISTEN_WINDOW_MS });
    const resultAt = Date.now();
    listeningRef.current = false;
    setListening(false);
    if (!alive.current || !heard.ok) return; // silence or a mic error: nothing happens, tap still works
    await onHeard(heard.transcript, listenStartedAt, resultAt);
  }

  async function onHeard(transcript: string, listenStartedAt: number, resultAt: number) {
    const card = readyRef.current;
    if (!card) return;
    const input = {
      card: {
        txnRef,
        payeeId: card.payee.id,
        paise: card.amountPaise,
        tone: card.tone,
        reasks: reasks.current,
        amberStep: amberStep.current,
        ...(card.offerPaise !== null ? { offerPaise: card.offerPaise } : {}),
      },
      currentTxnRef: txnRef,
      used: await confirmLock.isUsed(txnRef),
      heard: { transcript, forTxnRef: txnRef, listenStartedAt, resultAt, lastSpoken: lastSpoken.current },
    };
    let decision = decideVoice(input);
    if (decision.kind === "askServer") decision = decideVoice(input, await readChange(transcript, card.payee, card.amountPaise));
    if (alive.current) await act(decision, card.payee.id);
  }

  // What the speech changes, read by /turn (text only) and resolved to a saved payee on the phone.
  async function readChange(transcript: string, payee: Payee, amountPaise: number): Promise<TurnOutcome> {
    // The card's own payment is the draft (matched by its saved name, on the phone only). The card's
    // spoken question is not sent: it contains the payee's saved name.
    const base: ConversationState = {
      ...conversation.get(),
      draft: { name: payee.displayName, amount: { kind: "paise", paise: amountPaise } },
      awaiting: null,
    };
    const withUser = addUserTurn(base, transcript);
    const reply = await sendTurn(turnsForServer(withUser), "draft");
    if (!reply.ok) return { kind: "failed" };
    const { state: next, step } = applyAction(withUser, reply.action);
    if (step.kind === "ask") return step.question === "exactAmount" ? { kind: "relative" } : { kind: "other" };
    // A spending question or a reminder isn't a change to this card: "not clear" (ask on Home).
    if (step.kind !== "resolve") return { kind: "other" };

    const [{ payees }, { entries, corrupt }] = await Promise.all([payeeStore.load(), historyStore.load()]);
    const result = resolvePayment({
      name: step.name,
      amount: step.amount,
      payees,
      history: entries,
      historyUnreadable: corrupt,
      now: Date.now(),
    });
    if (result.kind !== "confirm") return { kind: "other" }; // unknown or ambiguous name: say it on Home instead
    changedConversation.current = next;
    return { kind: "change", payeeId: result.payee.id, paise: result.amountPaise };
  }

  async function act(decision: VoiceDecision, cardPayeeId: string) {
    const t = textsRef.current ?? speechTexts("en-IN");
    switch (decision.kind) {
      case "ignore":
      case "askServer":
        return;
      case "confirm":
        return yesRef.current();
      case "cancel": {
        alive.current = false;
        await confirmLock.acquire(txnRef); // this card can never be confirmed now
        conversation.reset();
        paymentQueue.clear(); // M14: "nahi" also drops the payments still waiting from the same message
        lastSpoken.current = t.cancelled;
        keepSpeaking.current = true; // "Cancelled" finishes after the card closes
        Speech.speak(t.cancelled, { language: speechLang ?? "en-IN" });
        return router.dismissAll();
      }
      case "pause":
        setVoiceNote(strings.voice.paused);
        return say(t.paused, false);
      case "askAgain": // amber card, first yes
        amberStep.current = 2;
        setVoiceNote(strings.amber.askAgainHint);
        return say(t.askAgain, true);
      case "newCard":
        return openNewCard(decision.payeeId || cardPayeeId, decision.paise);
      case "reask":
        reasks.current += 1;
        return say(t.reask(t.rupees(decision.paise)), true);
      case "tapOnly":
        setVoiceNote(strings.voice.tapOnly);
        return say(t.tapOnly, false);
      case "notClear":
        return setVoiceNote(decision.hint === "fullAmount" ? s.fullAmount : s.notClear);
    }
  }

  useEffect(() => {
    if (!spoken) return;
    alive.current = true;
    say(spoken, canListen);
    return () => {
      alive.current = false;
      if (!keepSpeaking.current) Speech.stop();
      stopListening();
    };
    // say() only reads refs; re-run only when the card's question or mic permission changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spoken, canListen]);

  // A change, or the red card's offer: this card's txnRef is locked for good, and the new card runs the
  // rules again and asks again.
  async function openNewCard(payeeId: string, paise: number) {
    alive.current = false;
    stopListening();
    Speech.stop();
    await confirmLock.acquire(txnRef); // the old card can never be confirmed
    if (changedConversation.current) conversation.set(changedConversation.current);
    const newRef = txnRefFor(await rehearsal.load());
    router.replace({ pathname: "/confirm", params: { payeeId, amountPaise: String(paise), txnRef: newRef } });
  }

  function tapMic() {
    if (listeningRef.current) return stopListening();
    Speech.stop();
    setTimeout(listenNow, SETTLE_MS);
  }

  async function yes() {
    if (state.kind !== "ready" || !state.rule.ok || sending || sendingRef.current) return;
    sendingRef.current = true;
    Speech.stop();
    stopListening();
    setListening(false);
    setSending(true);
    // Rehearsal mode is read again right now: in rehearsal the real launcher is never used.
    const launcher = launcherFor(txnRef, await rehearsal.load(), upiLauncher);
    if (!launcher) {
      setState({ kind: "modeChanged" });
      return;
    }
    if (!(await confirmLock.acquire(txnRef))) {
      setState({ ...state, used: true });
      return;
    }
    try {
      const outcome = await sendPayment(
        { payee: state.payee, amountPaise: state.amountPaise, txnRef, now: Date.now() },
        launcher,
      );
      // Something changed since the card was shown: nothing was written or launched. The lock stays
      // taken, so this card can't be sent; the user starts again from Home.
      if (outcome.kind === "blocked") {
        lastOutcome.set({
          kind: "blocked",
          reason: outcome.reason,
          payeeName: state.payee.displayName,
          amountPaise: state.amountPaise,
          sentTodayPaise: Math.max(0, DAILY_LIMIT_PAISE - state.remainingPaise),
          leftTodayPaise: state.remainingPaise,
        });
        return setState({ kind: "blocked", reason: outcome.reason });
      }
      conversation.reset(); // this payment is done; the next one starts a new conversation
      router.replace({ pathname: "/receipt", params: { txnRef, ...(outcome.launchFailed ? { launchFailed: "1" } : {}) } });
    } catch {
      setError(s.sendFailed); // the lock stays taken: this txnRef can't be sent again
    }
  }

  // Speech callbacks call the latest yes() (after render, not during it).
  useEffect(() => {
    yesRef.current = yes;
  });

  if (state.kind === "loading") {
    return (
      <Screen>
        <RehearsalBanner />
        <Text style={ui.muted}>{strings.common.loading}</Text>
      </Screen>
    );
  }

  if (state.kind === "missing") {
    return (
      <Screen>
        <RehearsalBanner />
        <Notice text={s.payeeMissing} />
        <Button variant="secondary" label={strings.common.back} onPress={() => router.back()} />
      </Screen>
    );
  }

  if (state.kind === "modeChanged" || state.kind === "blocked") {
    const text =
      state.kind === "modeChanged"
        ? strings.rehearsal.modeChanged
        : state.reason === "PAYEE_CHANGED"
          ? s.payeeChanged
          : strings.rules[state.reason];
    return (
      <Screen>
        <RehearsalBanner />
        <Notice title={state.kind === "blocked" ? s.blockedTitle : undefined} text={text} />
        <Button variant="secondary" label={strings.common.home} onPress={() => router.dismissAll()} />
      </Screen>
    );
  }

  const { payee, amountPaise, rule, remainingPaise, used, newPayee, tone, warnings, offerPaise } = state;
  const micButton = voiceOn && (
    <Button variant="secondary" label={listening ? s.micListening : s.mic} onPress={tapMic} disabled={sending} />
  );
  const phoneEnd = lastFour(payee.phone);

  return (
    <Screen>
      <RehearsalBanner />
      <Card>
        <Text style={styles.label}>{s.send}</Text>
        <Text style={styles.amount}>{Number.isFinite(amountPaise) ? formatRupees(amountPaise) : "—"}</Text>
        <Text style={styles.label}>{s.to}</Text>
        <View style={styles.payeeRow}>
          <View style={styles.initial}>
            <Text style={styles.initialText}>{payee.displayName.trim().charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{payee.displayName}</Text>
        </View>
        <View style={styles.details}>
          <Text style={ui.muted}>
            {s.upiId}: {maskVpa(payee.vpa)}
          </Text>
          {phoneEnd && (
            <Text style={ui.muted}>
              {s.phone}: {phoneEnd}
            </Text>
          )}
        </View>
      </Card>

      {newPayee && rule.ok && (
        <Notice
          tone="info"
          text={newPayee.kind === "added" ? s.newPayee(newPayee.hours) : s.vpaChanged(newPayee.hours)}
        />
      )}

      {!rule.ok ? (
        <>
          <Notice
            title={s.blockedTitle}
            text={
              rule.reason === "OVER_DAILY"
                ? `${strings.rules.OVER_DAILY} ${strings.dailyRemaining(formatRupees(remainingPaise))}`
                : rule.reason === "NEW_PAYEE_LIMIT" && newPayee
                  ? `${strings.rules.NEW_PAYEE_LIMIT} ${strings.newPayeeHoursLeft(newPayee.hours)}`
                  : strings.rules[rule.reason]
            }
          />
          {offerPaise !== null && !used && (
            <>
              {listening && <Notice tone="info" text={s.listeningYes} />}
              <Button label={strings.offer.button(formatRupees(offerPaise))} onPress={() => openNewCard(payee.id, offerPaise)} />
              {micButton}
            </>
          )}
          {rule.reason === "HISTORY_UNREADABLE" && (
            <Button variant="secondary" label={strings.common.goToSettings} onPress={() => router.push("/settings")} />
          )}
          {/* M17: stuck on a red card → the family helper is one tap away. */}
          <CallHelperButton />
          <Button variant="secondary" label={strings.common.back} onPress={() => router.back()} />
        </>
      ) : used ? (
        <>
          <Notice tone="info" text={s.alreadyConfirmed} />
          <Button variant="secondary" label={strings.common.home} onPress={() => router.dismissAll()} />
        </>
      ) : sending && !error ? (
        // M16: one clear step while the UPI app opens; she approves there (fingerprint or PIN).
        <Card>
          <Text style={styles.opening}>{isRehearsalRef(txnRef) ? strings.rehearsal.sending : s.sending}</Text>
          {!isRehearsalRef(txnRef) && <Text style={ui.body}>{s.openingHint}</Text>}
        </Card>
      ) : (
        <View style={ui.gap}>
          {tone === "amber" && (
            <Notice
              tone="warning"
              title={strings.amber.title}
              text={warnings.map((w) => strings.amber.warnings[w](payee.displayName)).join("\n")}
            />
          )}
          {error && <Notice text={error} />}
          {listening && <Notice tone="info" text={s.listeningYes} />}
          {voiceNote && !listening && <Text style={ui.muted}>{voiceNote}</Text>}
          <Button
            label={sending ? (isRehearsalRef(txnRef) ? strings.rehearsal.sending : s.sending) : tone === "amber" ? strings.amber.yesSure : s.yes}
            onPress={yes}
            disabled={sending || !!error}
          />
          {micButton}
          <Button variant="secondary" label={s.no} onPress={() => router.back()} disabled={sending} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: fontSize.label, color: colors.muted },
  amount: { fontSize: 56, fontFamily: fonts.bold, color: colors.primary, letterSpacing: -1 },
  name: { flexShrink: 1, fontSize: 32, fontFamily: fonts.bold, color: colors.text },
  payeeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  initial: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  initialText: { fontSize: 30, fontFamily: fonts.bold, color: colors.primary },
  opening: { fontSize: fontSize.heading, fontFamily: fonts.bold, color: colors.primary },
  details: { gap: spacing.xs, marginTop: spacing.sm },
});
