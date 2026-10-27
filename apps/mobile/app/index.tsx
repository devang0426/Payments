// Home: a short spoken conversation ("Mummy ko bhejo" → "How much?" → "pichhli baar jitna" → card).
// Each user turn goes to the server's /turn (text only); the phone keeps the conversation, matches
// the payee and runs the rules. The app's questions are spoken; in a development/release build the
// mic reopens once after each question.
// M13: text with a UPI ID or phone number is never sent (lib/prefilter; a UPI ID opens the facts
// screen). Spending questions are answered by the phone from its own history; reminders open the
// reminder card. Neither answer goes back to the server.
// M16 (docs/VOICE-PLAN.md): voice first. One big mic; Home speaks its question and opens the mic by
// itself whenever it is shown. Silence or a failed request gets one spoken nudge, then Home waits for
// a tap (lib/voiceFlow). Typing, payments and Settings sit behind small links. In Expo Go (no in-app
// mic) the text box is shown instead.
// M17: when Home goes quiet it shows "📞 Call <helper>"; after two failed requests it also asks "Should
// I call Beta?" and listens once (lib/helper decideHelpVoice). A tapped reminder that needs an amount
// replaces the conversation from outside; Home then asks at once.
import { router, useFocusEffect } from "expo-router";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, TextInput, View } from "react-native";

import { CallHelperButton, callHelper } from "@/components/CallHelper";
import { PaymentRow } from "@/components/PaymentRow";
import { RehearsalBanner } from "@/components/RehearsalBanner";
import { Button, Card, Notice, Screen, Text, ui } from "@/components/ui";
import { planActions, runAgentTurn, type Display, type MessageId, type Special, type StepRecord } from "@/lib/agent";
import { checkAlias } from "@/lib/alias";
import { checkHealth, sendAgent, type HealthStatus } from "@/lib/api";
import { findContactByName } from "@/lib/contacts";
import {
  addUserTurn,
  applyAction,
  askForAmount,
  startConversation,
  turnsForServer,
  type ConversationState,
  type ServerAction,
} from "@/lib/conversation";
import { explainOutcome } from "@/lib/explain";
import { encodeAmount, lastPaidAmount, resolvePayment } from "@/lib/flow";
import { formatRupees } from "@/lib/format";
import { decideHelpVoice, type Helper } from "@/lib/helper";
import type { HistoryEntry } from "@/lib/history";
import { matchPayees } from "@/lib/match";
import type { Payee } from "@/lib/payees";
import { paymentInFlight } from "@/lib/pay";
import { screenText } from "@/lib/prefilter";
import { txnRefFor } from "@/lib/rehearsal";
import { speechTexts, type SpeechTexts } from "@/lib/speech";
import { hasHindiVoice, speechLanguage } from "@/lib/speechLang";
import { spendingLine, spendingSummary, type Period } from "@/lib/spending";
import { DAILY_LIMIT_PAISE, sentTodayPaise } from "@/lib/rules";
import { applyPreference } from "@/lib/preferences";
import {
  conversation,
  helperStore,
  historyStore,
  lastOutcome,
  lastSpokenName,
  payeeStore,
  paymentQueue,
  prefsStore,
  rehearsal,
} from "@/lib/stores";
import { strings } from "@/lib/strings";
import { colors, fontSize, fonts, radius, spacing } from "@/lib/theme";
import {
  getVoiceLang,
  listenOnce,
  loadVoiceLang,
  setVoiceLang,
  stopListening,
  voiceAvailable,
  type VoiceLang,
} from "@/lib/voice";
import { LISTEN_WINDOW_MS } from "@/lib/voiceConfirm";
import { HOME_LISTEN_MS, afterMiss, greetingQuestion } from "@/lib/voiceFlow";

const s = strings.home;
const MIC_SIZE = 200;
const SETTLE_MS = 250; // after our own speech ends, before the mic opens (less echo)

type Message = { text: string; showSettings: boolean; extra?: string; upiVpa?: string };
type Spending = { period: Period; rows: { name: string | null; line: string }[] };

const healthText: Record<HealthStatus | "checking", string> = {
  checking: s.serverChecking,
  ok: s.serverOk,
  down: s.serverDown,
  "not-configured": s.serverNotConfigured,
};

export default function HomeScreen() {
  const [typed, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceLang, setVoiceLangState] = useState<VoiceLang>(getVoiceLang());
  const micReady = voiceAvailable();
  const [typing, setTyping] = useState(!micReady);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [spending, setSpending] = useState<Spending | null>(null);
  const [health, setHealth] = useState<HealthStatus | "checking">("checking");
  const [question, setQuestion] = useState<string>(s.prompt);
  const [heardText, setHeardText] = useState("");
  const [hasTurns, setHasTurns] = useState(conversation.get().turns.length > 0);
  const [stuck, setStuck] = useState(false); // Home went quiet: show "Call <helper>"
  const helper = useRef<Helper | null>(null);
  // M14 displays and the DEV step record (memory only).
  const [recent, setRecent] = useState<{ title: string; entries: HistoryEntry[] } | null>(null);
  const [limitLeft, setLimitLeft] = useState<number | null>(null);
  const [steps, setSteps] = useState<StepRecord[]>([]);

  const recoveryChecked = useRef(false);
  const focused = useRef(false);
  // listen() and next() also run from speech callbacks that fire after a re-render, so their guards
  // read refs, not the state captured when the callback was created.
  const busyRef = useRef(false);
  const listeningRef = useRef(false);
  const misses = useRef(0); // silences / failed requests in a row (lib/voiceFlow)
  const stoppedByTap = useRef(false);
  const setBusyNow = (value: boolean) => {
    busyRef.current = value;
    setBusy(value);
  };
  const setListeningNow = (value: boolean) => {
    listeningRef.current = value;
    setListening(value);
  };

  const save = (state: ReturnType<typeof conversation.get>) => {
    conversation.set(state);
    setHasTurns(state.turns.length > 0);
  };

  // Speak Home's question for where the conversation is, then listen (development/release build).
  function greet() {
    const state = conversation.get();
    setHasTurns(state.turns.length > 0);
    const q = greetingQuestion(state);
    const forName = q === "amount" ? state.draft.name : undefined;
    setQuestion(forName ? s.amountFor(forName) : state.turns.length === 0 ? s.prompt : strings.conversation[q]);
    misses.current = 0;
    setStuck(false);
    if (micReady) sayAloud((t) => (forName ? t.amountFor(forName) : t.questions[q]), true);
  }

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      checkHealth().then(setHealth);
      loadVoiceLang().then(setVoiceLangState);
      helperStore.load().then((h) => (helper.current = h));
      // A tapped reminder asked "How much?" while Home was already on screen: ask it now.
      const offOutside = conversation.onOutsideChange(() => {
        Speech.stop();
        stoppedByTap.current = true;
        stopListening();
        setMessage(null);
        setSpending(null);
        setHeardText("");
        greet();
      });

      // Once per app start: a payment still "pending" means FlowPay was closed while PhonePe was
      // open. Ask the user what happened (the oldest one first) instead of greeting.
      if (!recoveryChecked.current) {
        recoveryChecked.current = true;
        historyStore
          .listPending()
          .then((pending) => {
            const unresolved = pending.filter((e) => e.txnRef !== paymentInFlight()).at(-1);
            if (unresolved) router.push({ pathname: "/receipt", params: { txnRef: unresolved.txnRef, recovered: "1" } });
            else if (focused.current) resume();
          })
          // History unreadable: nothing to ask about here (payments stay blocked by the rules); greet anyway.
          .catch(() => {
            if (focused.current) resume();
          });
      } else {
        resume();
      }
      return () => {
        focused.current = false;
        offOutside();
        Speech.stop();
        stopListening();
      };
      // greet() only reads refs and stores.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // The big mic breathes while it listens.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!listening) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [listening, pulse]);

  // In-app mic (development/release build only). The live transcript shows under the question; when
  // the user stops talking it goes straight to the conversation.
  async function listen() {
    if (busyRef.current || listeningRef.current || !focused.current) return;
    Speech.stop();
    setMessage(null);
    setHeardText("");
    stoppedByTap.current = false;
    setListeningNow(true);
    const heard = await listenOnce({ lang: getVoiceLang(), onPartial: setHeardText, timeoutMs: HOME_LISTEN_MS, patient: true });
    setListeningNow(false);
    if (heard.ok) {
      misses.current = 0;
      setStuck(false);
      setHeardText(heard.transcript);
      next(heard.transcript);
    } else if (heard.reason === "denied") {
      setTyping(true);
      setMessage({ text: s.micDenied, showSettings: false });
    } else if (heard.reason !== "unavailable" && !stoppedByTap.current) {
      miss("silence");
    }
  }

  // Silence or a failed request: one spoken nudge and one more listen, then quiet.
  function miss(kind: "silence" | "failed") {
    misses.current += 1;
    if (kind === "failed") {
      lastOutcome.set({ kind: "failed" });
      setMessage({ text: s.failed, showSettings: false });
    }
    if (!focused.current) return;
    if (afterMiss(misses.current) === "nudge") {
      sayAloud((t) => (kind === "failed" ? t.failed : t.nudge), true);
      return;
    }
    setStuck(true);
    if (kind === "silence") setMessage({ text: s.micNothing, showSettings: false });
    // She tried twice and it still didn't work: offer the family helper out loud.
    else if (helper.current && micReady) offerHelp(helper.current);
  }

  // "Should I call Beta?" → one listen; only a clear yes (code, lib/helper) opens the dialer.
  async function offerHelp(h: Helper) {
    if (!prefsStore.get().speakReplies) return; // only the button then
    const lang = await speechLanguage();
    const t = speechTexts(lang);
    const asked = t.helperAsk(h.name);
    Speech.speak(asked, {
      language: lang,
      onDone: () => {
        if (focused.current) setTimeout(() => listenForHelp(h, asked), SETTLE_MS);
      },
    });
  }

  async function listenForHelp(h: Helper, asked: string) {
    if (busyRef.current || listeningRef.current || !focused.current) return;
    stoppedByTap.current = false;
    setListeningNow(true);
    const listenStartedAt = Date.now();
    const heard = await listenOnce({ lang: getVoiceLang(), timeoutMs: LISTEN_WINDOW_MS });
    const resultAt = Date.now();
    setListeningNow(false);
    if (!heard.ok || !focused.current) return;
    if (decideHelpVoice({ transcript: heard.transcript, listenStartedAt, resultAt, lastSpoken: asked }) !== "call") return;
    sayAloud((t) => t.helperCalling(h.name), false);
    callHelper(h);
  }

  function tapMic() {
    if (listeningRef.current) {
      stoppedByTap.current = true;
      return stopListening();
    }
    misses.current = 0;
    setStuck(false);
    listen();
  }

  // Speak (in Hindi when the mic is हिं and a Hindi voice exists); then, in a development/release
  // build, listen once for the answer. Android queues speech, so a line still playing from the
  // previous screen ("Cancelled", the payment result) finishes first.
  async function sayAloud(pick: (t: SpeechTexts) => string, thenListen: boolean) {
    // M15 "speak replies" off: the answer is only shown; the mic still opens for the next answer.
    if (!prefsStore.get().speakReplies) {
      if (thenListen && focused.current && micReady) listen();
      return;
    }
    const lang = await speechLanguage();
    Speech.speak(pick(speechTexts(lang)), {
      language: lang,
      onDone: () => {
        if (thenListen && focused.current && micReady) listen();
      },
    });
  }

  function toggleLang() {
    const nextLang = voiceLang === "en-IN" ? "hi-IN" : "en-IN";
    setVoiceLang(nextLang);
    setVoiceLangState(nextLang);
  }

  function startOver() {
    Speech.stop();
    stopListening();
    conversation.reset();
    paymentQueue.clear();
    setMessage(null);
    setSpending(null);
    setRecent(null);
    setLimitLeft(null);
    setText("");
    setHeardText("");
    greet();
  }

  // A UPI ID or phone number: never sent. Answered here, and a UPI ID can be checked on the phone.
  function blocked(vpa: string | null) {
    lastOutcome.set({ kind: "screened" });
    setText("");
    setMessage({ text: strings.upiCheck.blockedText, extra: strings.upiCheck.onlySaved, showSettings: true, ...(vpa ? { upiVpa: vpa } : {}) });
    sayAloud((t) => t.blocked, false);
  }

  function dontKnow(name: string) {
    lastOutcome.set({ kind: "noPayee", name });
    setMessage({ text: s.dontKnow(name), showSettings: true });
    sayAloud((t) => t.dontKnow(name), false);
  }

  // show_spending: worked out from the phone's own history; shown (and spoken) here only.
  async function showSpending(name: string | undefined, period: Period) {
    const [{ payees }, { entries }] = await Promise.all([payeeStore.load(), historyStore.load()]);
    let targets: (Payee | null)[] = [null];
    if (name) {
      const match = matchPayees(name, payees);
      if (match.kind === "none") return dontKnow(name);
      targets = match.kind === "one" ? [match.payee] : match.payees;
    }
    const now = Date.now();
    const sums = targets.map((p) => ({ p, sum: spendingSummary({ history: entries, period, now, ...(p ? { payeeId: p.id } : {}) }) }));
    setSpending({ period, rows: sums.map(({ p, sum }) => ({ name: p?.displayName ?? null, line: spendingLine(sum) })) });
    if (sums.length === 1) sayAloud((t) => t.spending(t.rupees(sums[0]!.sum.totalPaise), sums[0]!.sum.count), false);
  }

  // create_reminder: resolve the payee and the amount here, then the reminder card asks for the yes.
  async function openReminderCard(step: { name: string; amount?: { kind: "paise"; paise: number } | { kind: "last" }; when: object }) {
    const [{ payees }, { entries }] = await Promise.all([payeeStore.load(), historyStore.load()]);
    const match = matchPayees(step.name, payees);
    if (match.kind === "none") return dontKnow(step.name);
    if (match.kind === "many") return setMessage({ text: s.reminderWhich(step.name), showSettings: false });
    const amountPaise =
      step.amount?.kind === "paise" ? step.amount.paise : step.amount?.kind === "last" ? lastPaidAmount(match.payee.id, entries) : null;
    router.push({
      pathname: "/reminder",
      params: { payeeId: match.payee.id, when: JSON.stringify(step.when), ...(amountPaise ? { amountPaise: String(amountPaise) } : {}) },
    });
  }

  // spoken = the in-app mic's transcript; undefined = the typed text.
  async function next(spoken?: string) {
    const text = (spoken ?? typed).trim();
    if (busyRef.current || !text) return;
    setMessage(null);
    setSpending(null);
    setRecent(null);
    setLimitLeft(null);
    if (spoken === undefined) setHeardText(text);
    const screened = screenText(text);
    if (screened.kind !== "ok") return blocked(screened.kind === "upiId" ? screened.vpa : null);
    setBusyNow(true);
    try {
      const withUser = addUserTurn(conversation.get(), text);
      // Only the conversation text goes to the server; payees, contacts and history stay on the phone.
      // M14: the agent may ask the phone to look a name up first; only a match type goes back.
      const { payees } = await payeeStore.load();
      const turn = await runAgentTurn({
        turns: turnsForServer(withUser),
        awaiting: withUser.awaiting,
        send: (body) => sendAgent(body),
        findPayee: (name) => matchPayees(name, payees),
      });
      if (__DEV__) setSteps(turn.record);
      if (!turn.ok) {
        if (turn.blocked) return blocked(null);
        // Not kept in the conversation, so trying again sends the same thing.
        if (spoken !== undefined) return miss("failed");
        lastOutcome.set({ kind: "failed" });
        return setMessage({ text: s.failed, showSettings: false });
      }
      setText("");
      const plan = planActions(turn.actions, turn.found);
      if (plan.special) await doSpecial(plan.special);
      paymentQueue.set(plan.queue); // further payments: one card (and one yes) each, after this one
      const base = plan.reset ? startConversation() : withUser;
      if (plan.tell) {
        const { message, name } = plan.tell;
        setMessage({ text: tellText(message, name), showSettings: message === "only_saved_payees" || message === "payee_not_saved" });
        sayAloud((t) => t.tell(message, name), false);
      }
      if (plan.display) await showDisplay(plan.display);
      if (plan.primary) await act(base, plan.primary);
      else save(base);
    } finally {
      setBusyNow(false);
    }
  }

  // One conversation action: ask, show, open the reminder card, or resolve the payment and open its
  // card. Also runs a queued payment when Home comes back.
  async function act(base: ConversationState, action: ServerAction) {
    const { state, step } = applyAction(base, action);
    save(state);

    if (step.kind === "cancelled") {
      setQuestion(s.prompt);
      return sayAloud((t) => t.cancelled, false);
    }
    if (step.kind === "ask") {
      if (step.question === "exactAmount") lastOutcome.set({ kind: "relative" });
      // "How much should I send to Papa?": the name is her own word, said on the phone only; the
      // conversation (what the server sees) keeps the plain question.
      const forName = step.question === "amount" ? state.draft.name : undefined;
      setQuestion(forName ? s.amountFor(forName) : strings.conversation[step.question]);
      return sayAloud((t) => (forName ? t.amountFor(forName) : t.questions[step.question]), true);
    }
    if (step.kind === "showSpending") return showSpending(step.name, step.period);
    if (step.kind === "reminder") return openReminderCard(step);

    const [{ payees }, { entries, corrupt }] = await Promise.all([payeeStore.load(), historyStore.load()]);
    const result = resolvePayment({
      name: step.name,
      amount: step.amount,
      payees,
      history: entries,
      historyUnreadable: corrupt,
      now: Date.now(),
    });

    if (result.kind === "confirm") {
      lastSpokenName.set(result.payee.id, step.name); // M15: "you said maa, saved as Mummy"
      const txnRef = txnRefFor(await rehearsal.load());
      router.push({
        pathname: "/confirm",
        params: { payeeId: result.payee.id, amountPaise: String(result.amountPaise), txnRef },
      });
    } else if (result.kind === "choose") {
      router.push({ pathname: "/choose", params: { name: result.name, amount: encodeAmount(result.amount) } });
    } else if (result.kind === "noPrevious") {
      // Shown and spoken on the phone only (it names the saved payee); the server just sees "How much?".
      save(askForAmount(state).state);
      setQuestion(s.noPrevious(result.payee.displayName));
      sayAloud((t) => t.noPrevious(result.payee.displayName), true);
    } else {
      const lookup = await findContactByName(result.name);
      if (lookup === "found") {
        setMessage({ text: s.noUpiFor(result.name), showSettings: true });
        sayAloud((t) => t.noUpiFor(result.name), false);
      } else {
        dontKnow(result.name);
        if (lookup === "denied") setMessage({ text: s.dontKnow(result.name), showSettings: true, extra: s.contactsDenied });
      }
    }
  }

  // M15: a preference, a nickname proposal (the alias card asks for the fingerprint), or "why".
  async function doSpecial(sp: Special) {
    if (sp.kind === "preference") {
      const result = applyPreference(prefsStore.get(), sp.change);
      if (!result) return act(conversation.get(), { action: "unknown" });
      await prefsStore.set(result.prefs);
      if (result.micLang) {
        setVoiceLang(result.micLang);
        setVoiceLangState(result.micLang);
      }
      const key = `${sp.change.key}:${sp.change.value}`;
      const noVoice = result.prefs.replyLanguage === "hi" && !(await hasHindiVoice());
      setMessage({ text: strings.prefs.changed[key] ?? "", showSettings: false, ...(noVoice ? { extra: strings.prefs.noHindiVoice } : {}) });
      return sayAloud((t) => t.prefChanged(sp.change.key, sp.change.value), false);
    }
    if (sp.kind === "alias") {
      const { payees } = await payeeStore.load();
      const check = checkAlias(sp.alias, sp.name, payees);
      if (check.ok) return router.push({ pathname: "/alias", params: { payeeId: check.payee.id, alias: check.alias } });
      setMessage({ text: strings.alias.refused[check.reason](sp.alias, sp.name), showSettings: check.reason === "many" });
      return sayAloud((t) => t.aliasRefused(check.reason, sp.alias, sp.name), false);
    }
    const outcome = lastOutcome.get();
    setMessage({ text: explainOutcome(outcome, strings.explain, formatRupees), showSettings: false });
    return sayAloud((t) => explainOutcome(outcome, t.explain, t.rupees), false);
  }

  // M14 displays: worked out from the phone's own history; the server only learned "shown".
  async function showDisplay(d: Display) {
    const [{ payees }, { entries }] = await Promise.all([payeeStore.load(), historyStore.load()]);
    if (d.kind === "limitLeft") {
      const left = Math.max(0, DAILY_LIMIT_PAISE - sentTodayPaise(entries, Date.now()));
      setLimitLeft(left);
      return sayAloud((t) => t.dailyRemaining(t.rupees(left)), false);
    }
    let ids: Set<string> | null = null;
    let title: string | null = null;
    if (d.name) {
      const match = matchPayees(d.name, payees);
      if (match.kind === "none") return dontKnow(d.name);
      const list = match.kind === "one" ? [match.payee] : match.payees;
      ids = new Set(list.map((p) => p.id));
      title = list.length === 1 ? list[0]!.displayName : d.name;
    }
    const rows = entries.filter((e) => !ids || ids.has(e.payeeId)).slice(0, d.limit);
    setRecent({ title: strings.agent.recentTitle(title), entries: rows });
    sayAloud((t) => t.recent(rows.length), false);
  }

  // Next payment from one message ("… aur Papa ko 300"), else the usual question. The receipt's
  // spoken result ("Done. 500 rupees sent to Mummy.") finishes first; the next card would cut it off.
  function resume() {
    const queuedPay = paymentQueue.next();
    if (!queuedPay) return greet();
    setBusyNow(true);
    waitForQuiet()
      .then(() => (focused.current ? act(startConversation(), queuedPay) : paymentQueue.set([queuedPay])))
      .finally(() => setBusyNow(false));
  }

  const micLabel = busy ? s.checking : listening ? s.micOn : s.micIdle;

  return (
    <Screen edges={["top", "bottom"]}>
      <RehearsalBanner />
      <View style={styles.topRow}>
        <Text style={styles.brand}>{strings.appName}</Text>
        <View style={styles.topLinks}>
          {micReady && (
            <Pressable accessibilityRole="button" onPress={toggleLang} disabled={listening} style={styles.pill}>
              <Text style={styles.pillText}>{voiceLang === "en-IN" ? s.langEnglish : s.langHindi}</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel={strings.common.settings} onPress={() => router.push("/settings")} style={styles.pill}>
            <Text style={styles.pillText}>⚙</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.center}>
        <Text style={styles.question} accessibilityRole="header">
          {question}
        </Text>
        {heardText !== "" && <Text style={styles.heard}>“{heardText}”</Text>}

        {micReady && (
          <View style={styles.micWrap}>
            <Animated.View style={[styles.halo, listening && styles.haloOn, { transform: [{ scale: pulse }] }]} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={micLabel}
              onPress={tapMic}
              disabled={busy}
              style={({ pressed }) => [styles.mic, listening && styles.micOn, (pressed || busy) && styles.micDim]}
            >
              <Text style={styles.micIcon}>🎤</Text>
              <Text style={styles.micText}>{micLabel}</Text>
              {listening && <Text style={styles.micHint}>{s.micStop}</Text>}
            </Pressable>
          </View>
        )}
      </View>

      {stuck && <CallHelperButton variant="primary" />}

      {message && (
        <View style={ui.gap}>
          <Notice tone="info" text={message.text} />
          {message.extra && <Text style={ui.muted}>{message.extra}</Text>}
          {message.upiVpa && (
            <Button
              variant="secondary"
              label={strings.upiCheck.check}
              onPress={() => router.push({ pathname: "/upi-check", params: { vpa: message.upiVpa! } })}
            />
          )}
          {message.showSettings && (
            <Button variant="secondary" label={strings.common.goToSettings} onPress={() => router.push("/settings")} />
          )}
        </View>
      )}

      {spending && (
        <Card>
          <Text style={ui.muted}>{strings.spending.periods[spending.period]}</Text>
          {spending.rows.map((row, i) => (
            <View key={i} style={{ gap: spacing.xs }}>
              <Text style={styles.spendingName}>{strings.spending.title(row.name)}</Text>
              <Text style={styles.spendingLine}>{row.line}</Text>
            </View>
          ))}
          <Text style={ui.muted}>{strings.spending.note}</Text>
        </Card>
      )}

      {limitLeft !== null && (
        <Card>
          <Text style={ui.muted}>{strings.agent.limitLeftTitle}</Text>
          <Text style={styles.spendingLine}>{formatRupees(limitLeft)}</Text>
        </Card>
      )}

      {recent && (
        <View style={ui.gap}>
          <Text style={styles.spendingName}>{recent.title}</Text>
          {recent.entries.length === 0 ? (
            <Text style={ui.muted}>{s.noRecent}</Text>
          ) : (
            recent.entries.map((e) => <PaymentRow key={e.txnRef} entry={e} />)
          )}
        </View>
      )}

      {__DEV__ && steps.length > 0 && (
        <Text style={ui.muted}>
          {strings.agent.stepsTitle}: {steps.map((st) => `${st.step}: ${st.did}`).join(" · ")}
        </Text>
      )}

      {typing && (
        <View style={ui.gap}>
          <TextInput
            style={styles.input}
            value={typed}
            onChangeText={setText}
            placeholder={conversation.get().awaiting === "amount" ? s.placeholderAmount : s.placeholder}
            placeholderTextColor={colors.muted}
            multiline
            autoCorrect={false}
            returnKeyType="done"
            blurOnSubmit
            onSubmitEditing={() => next()}
            maxLength={300}
          />
          {!micReady && <Text style={ui.muted}>{s.micTip}</Text>}
          <Button label={busy ? s.checking : s.next} onPress={() => next()} disabled={busy || listening || !typed.trim()} />
        </View>
      )}

      <View style={styles.links}>
        {hasTurns && <Link label={s.startOver} onPress={startOver} />}
        {micReady && <Link label={typing ? s.hideTyping : s.typeInstead} onPress={() => setTyping(!typing)} />}
        <Link label={s.payments} onPress={() => router.push("/history")} />
        {/* Scan a payee's UPI QR → the Add payee form, filled (saving still needs the fingerprint/PIN). */}
        <Link label={s.addByQr} onPress={() => router.push({ pathname: "/scan-qr", params: { then: "add" } })} />
      </View>

      {health !== "ok" && health !== "checking" && (
        <Pressable onPress={() => { setHealth("checking"); checkHealth().then(setHealth); }}>
          <Text style={[ui.muted, styles.health]}>
            {s.serverLabel}: {healthText[health]}
          </Text>
        </Pressable>
      )}
    </Screen>
  );
}

// Resolves when the phone stops speaking (at most 8 s).
async function waitForQuiet(maxMs = 8000) {
  const until = Date.now() + maxMs;
  while (Date.now() < until && (await Speech.isSpeakingAsync().catch(() => false))) {
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

// The agent's fixed messages on screen (spoken: lib/speech.ts). Never the model's own words.
function tellText(message: MessageId, name = ""): string {
  if (message === "payee_saved") return strings.agent.payeeSaved(name);
  if (message === "payee_not_saved") return strings.agent.payeeNotSaved(name);
  return strings.agent.tell[message];
}

function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.link}>
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { fontSize: fontSize.heading, fontFamily: fonts.bold, color: colors.primary },
  topLinks: { flexDirection: "row", gap: spacing.sm },
  pill: {
    minWidth: 56,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  pillText: { color: colors.primary, fontFamily: fonts.bold, fontSize: fontSize.button },
  center: { alignItems: "center", gap: spacing.lg, paddingVertical: spacing.lg },
  question: { fontSize: 30, lineHeight: 38, fontFamily: fonts.bold, color: colors.text, textAlign: "center" },
  heard: { fontSize: 22, lineHeight: 30, color: colors.muted, textAlign: "center" },
  micWrap: { width: MIC_SIZE + 48, height: MIC_SIZE + 48, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  halo: {
    position: "absolute",
    width: MIC_SIZE + 48,
    height: MIC_SIZE + 48,
    borderRadius: (MIC_SIZE + 48) / 2,
    backgroundColor: "transparent",
  },
  haloOn: { backgroundColor: colors.primarySoft },
  mic: {
    width: MIC_SIZE,
    height: MIC_SIZE,
    borderRadius: MIC_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    elevation: 6,
  },
  micOn: { backgroundColor: colors.primaryDeep },
  micDim: { opacity: 0.6 },
  micIcon: { fontSize: 56 },
  micText: { color: colors.primaryText, fontFamily: fonts.bold, fontSize: fontSize.button },
  micHint: { color: colors.primaryText, fontSize: fontSize.label },
  input: {
    minHeight: 72,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.button,
    fontFamily: fonts.regular,
    color: colors.text,
    textAlignVertical: "top",
  },
  links: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.sm },
  link: { minHeight: 48, justifyContent: "center", paddingHorizontal: spacing.md },
  linkText: { color: colors.primary, fontFamily: fonts.bold, fontSize: fontSize.body },
  health: { textAlign: "center", color: colors.danger },
  spendingName: { fontSize: fontSize.body, fontFamily: fonts.bold, color: colors.text },
  spendingLine: { fontSize: fontSize.heading, fontFamily: fonts.bold, color: colors.primary },
});
