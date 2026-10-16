// Confirm card. Never trusts the previous screen: it reloads the payee and history and runs the
// rules again. A failed rule = red card and no "Yes" button. "Yes" works once per txnRef.
import { router, useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, Card, Notice, Screen, ui } from "@/components/ui";
import { formatRupees, lastFour, maskVpa, spokenRupees } from "@/lib/format";
import type { Payee } from "@/lib/payees";
import { sendPayment } from "@/lib/pay";
import { DAILY_LIMIT_PAISE, checkPayment, sentTodayPaise, type RuleResult } from "@/lib/rules";
import { confirmLock, historyStore, payeeStore } from "@/lib/stores";
import { upiLauncher } from "@/lib/upiLaunch";
import { listenOnce, stopListening, voiceAvailable } from "@/lib/voice";
import { isVoiceYes } from "@/lib/voiceYes";
import { strings } from "@/lib/strings";
import { colors, fontSize, spacing } from "@/lib/theme";

const s = strings.confirm;

type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "ready"; payee: Payee; amountPaise: number; rule: RuleResult; remainingPaise: number; used: boolean };

export default function ConfirmScreen() {
  const params = useLocalSearchParams<{ payeeId: string; amountPaise: string; txnRef: string }>();
  const txnRef = String(params.txnRef ?? "");
  const [state, setState] = useState<State>({ kind: "loading" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ payees }, { entries, corrupt }, used] = await Promise.all([
        payeeStore.load(),
        historyStore.load(),
        confirmLock.isUsed(txnRef),
      ]);
      const payee = payees.find((p) => p.id === params.payeeId);
      if (cancelled) return;
      if (!payee || !txnRef) return setState({ kind: "missing" });

      // Only plain digits are a valid amount; anything else is blocked by the rules.
      const amountPaise = /^\d{1,12}$/.test(String(params.amountPaise)) ? Number(params.amountPaise) : Number.NaN;
      const now = Date.now();
      const rule = checkPayment({ amountPaise, payee, history: entries, now, historyUnreadable: corrupt });
      const remainingPaise = Math.max(0, DAILY_LIMIT_PAISE - sentTodayPaise(entries, now));
      setState({ kind: "ready", payee, amountPaise, rule, remainingPaise, used });
    })();
    return () => {
      cancelled = true;
    };
  }, [params.payeeId, params.amountPaise, txnRef]);

  // Speak the question (or why it's blocked) once the card is ready. Confirming stays tap-only.
  const ready = state.kind === "ready" ? state : null;
  const spoken = !ready
    ? null
    : !ready.rule.ok
      ? ready.rule.reason === "OVER_DAILY"
        ? `${strings.speech.rules.OVER_DAILY} ${strings.dailyRemaining(spokenRupees(ready.remainingPaise))}`
        : strings.speech.rules[ready.rule.reason]
      : ready.used
        ? null
        : strings.speech.confirm(spokenRupees(ready.amountPaise), ready.payee.displayName);

  // Voice "Yes" (development/release build only): the mic opens only AFTER the question has been
  // spoken, listens once, and only a whole, clear yes/haan/हाँ counts. Tapping always works too.
  const [listeningYes, setListeningYes] = useState(false);
  const [notClear, setNotClear] = useState(false);
  const canVoiceYes = !!ready && ready.rule.ok && !ready.used && voiceAvailable();
  const yesRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!spoken) return;
    let cancelled = false;
    Speech.speak(spoken, {
      language: "en-IN",
      onDone: () => {
        if (cancelled || !canVoiceYes) return;
        setListeningYes(true);
        listenOnce({ timeoutMs: 6000 }).then((heard) => {
          if (cancelled) return;
          setListeningYes(false);
          if (heard.ok && isVoiceYes(heard.transcript)) yesRef.current();
          else if (heard.ok) setNotClear(true);
        });
      },
    });
    return () => {
      cancelled = true;
      Speech.stop();
      stopListening();
    };
  }, [spoken, canVoiceYes]);

  async function yes() {
    if (state.kind !== "ready" || !state.rule.ok || sending) return;
    Speech.stop();
    stopListening();
    setListeningYes(false);
    setSending(true);
    if (!(await confirmLock.acquire(txnRef))) {
      setState({ ...state, used: true });
      return;
    }
    try {
      const outcome = await sendPayment(
        { payee: state.payee, amountPaise: state.amountPaise, txnRef, now: Date.now() },
        upiLauncher,
      );
      router.replace({ pathname: "/receipt", params: { txnRef, ...(outcome.launchFailed ? { launchFailed: "1" } : {}) } });
    } catch {
      setError(s.sendFailed); // the lock stays taken: this txnRef can't be sent again
    }
  }

  yesRef.current = yes;

  if (state.kind === "loading") {
    return (
      <Screen>
        <Text style={ui.muted}>{strings.common.loading}</Text>
      </Screen>
    );
  }

  if (state.kind === "missing") {
    return (
      <Screen>
        <Notice text={s.payeeMissing} />
        <Button variant="secondary" label={strings.common.back} onPress={() => router.back()} />
      </Screen>
    );
  }

  const { payee, amountPaise, rule, remainingPaise, used } = state;
  const phoneEnd = lastFour(payee.phone);

  return (
    <Screen>
      <Card>
        <Text style={styles.label}>{s.send}</Text>
        <Text style={styles.amount}>{Number.isFinite(amountPaise) ? formatRupees(amountPaise) : "—"}</Text>
        <Text style={styles.label}>{s.to}</Text>
        <Text style={styles.name}>{payee.displayName}</Text>
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

      {!rule.ok ? (
        <>
          <Notice
            title={s.blockedTitle}
            text={
              rule.reason === "OVER_DAILY"
                ? `${strings.rules.OVER_DAILY} ${strings.dailyRemaining(formatRupees(remainingPaise))}`
                : strings.rules[rule.reason]
            }
          />
          {rule.reason === "HISTORY_UNREADABLE" && (
            <Button variant="secondary" label={strings.common.goToSettings} onPress={() => router.push("/settings")} />
          )}
          <Button variant="secondary" label={strings.common.back} onPress={() => router.back()} />
        </>
      ) : used ? (
        <>
          <Notice tone="info" text={s.alreadyConfirmed} />
          <Button variant="secondary" label={strings.common.home} onPress={() => router.dismissAll()} />
        </>
      ) : (
        <View style={ui.gap}>
          {error && <Notice text={error} />}
          {listeningYes && <Notice tone="info" text={s.listeningYes} />}
          {notClear && <Text style={ui.muted}>{s.notClear}</Text>}
          <Button label={sending ? s.sending : s.yes} onPress={yes} disabled={sending || !!error} />
          <Button variant="secondary" label={s.no} onPress={() => router.back()} disabled={sending} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: fontSize.label, color: colors.muted },
  amount: { fontSize: 48, fontWeight: "800", color: colors.text },
  name: { fontSize: 28, fontWeight: "700", color: colors.text },
  details: { gap: spacing.xs, marginTop: spacing.sm },
});
