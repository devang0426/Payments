// Receipt. M16: the result is also said out loud ("Done. 600 rupees sent to Ramesh."), with a big
// ✓ / ✕ so she can see it at a glance (lib/voiceFlow receiptSpeech).
// M17: a regular payment (same amount to the same payee, Done twice) offers a monthly reminder; the
// reminder card still asks for the yes.
import { router, useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import { Share, StyleSheet, View } from "react-native";

import { RehearsalBanner } from "@/components/RehearsalBanner";
import { Button, Card, Notice, Screen, Text, ui } from "@/components/ui";
import { formatIstDateTime, formatRupees, formatWhen } from "@/lib/format";
import type { HistoryEntry, PaymentStatus } from "@/lib/history";
import { paymentInFlight } from "@/lib/pay";
import { isRehearsalRef, txnRefFor } from "@/lib/rehearsal";
import { nextReminderAt, suggestMonthlyReminder, type When } from "@/lib/reminders";
import { speechTexts } from "@/lib/speech";
import { speechLanguage } from "@/lib/speechLang";
import { historyStore, lastOutcome, payeeStore, prefsStore, rehearsal, reminderStore } from "@/lib/stores";
import { strings } from "@/lib/strings";
import { colors, fontSize, fonts, spacing } from "@/lib/theme";
import { receiptSpeech } from "@/lib/voiceFlow";

const s = strings.receipt;

const statusColor: Record<PaymentStatus, string> = {
  success: colors.success,
  failed: colors.danger,
  unknown: colors.muted,
  pending: colors.muted,
};

const statusIcon: Record<PaymentStatus, string> = { success: "✓", failed: "✕", unknown: "?", pending: "…" };

export default function ReceiptScreen() {
  const { txnRef = "", recovered, launchFailed } = useLocalSearchParams<{
    txnRef: string;
    recovered?: string;
    launchFailed?: string;
  }>();
  const [entry, setEntry] = useState<HistoryEntry | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const [payeeExists, setPayeeExists] = useState(false);
  const [suggested, setSuggested] = useState<When | null>(null);

  const load = useCallback(() => {
    Promise.all([historyStore.load(), payeeStore.load(), reminderStore.list()]).then(([{ entries }, { payees }, reminders]) => {
      const found = entries.find((e) => e.txnRef === txnRef) ?? null;
      setEntry(found);
      setPayeeExists(!!found && payees.some((p) => p.id === found.payeeId));
      const offer = found && suggestMonthlyReminder({ entry: found, history: entries, reminders, now: Date.now() });
      setSuggested(offer ? { kind: "monthly", day: offer.day } : null);
    });
  }, [txnRef]);

  function remindMonthly() {
    if (!entry || !suggested) return;
    router.push({
      pathname: "/reminder",
      params: { payeeId: entry.payeeId, when: JSON.stringify(suggested), amountPaise: String(entry.amountPaise) },
    });
  }

  // Same payee + amount, new txnRef. Goes to the Confirm card, which re-checks the rules.
  async function payAgain() {
    if (!entry) return;
    const newRef = txnRefFor(await rehearsal.load());
    router.replace({
      pathname: "/confirm",
      params: { payeeId: entry.payeeId, amountPaise: String(entry.amountPaise), txnRef: newRef },
    });
  }

  useEffect(load, [load]);

  // The user's answer is saved to history; it decides whether the payment counts toward today.
  async function answer(status: "success" | "failed") {
    if (saving) return;
    setSaving(true);
    await historyStore.updateStatus(String(txnRef), status);
    setSaving(false);
    load();
  }

  const goHome = () => (router.canDismiss() ? router.dismissAll() : router.replace("/"));
  const needsAnswer =
    !!entry && (entry.status === "pending" || entry.status === "unknown") && paymentInFlight() !== entry.txnRef;

  // Say the result once per status (again after the user answers "Did it go through?").
  const spokenFor = useRef<string | null>(null);
  useEffect(() => {
    if (!entry) return;
    const key = `${entry.status}:${needsAnswer}`;
    if (spokenFor.current === key) return;
    spokenFor.current = key;
    // M15 "Kyun nahi gaya?": the result, as PhonePe reported it (or as she answered).
    if (!needsAnswer && entry.status !== "pending") {
      lastOutcome.set({ kind: "paid", status: entry.status, payeeName: entry.payeeName, amountPaise: entry.amountPaise, launchFailed: launchFailed === "1" });
    }
    if (!prefsStore.get().speakReplies) return;
    speechLanguage().then((lang) => {
      const line = receiptSpeech(speechTexts(lang), {
        status: entry.status,
        amountPaise: entry.amountPaise,
        name: entry.payeeName,
        rehearsal: isRehearsalRef(entry.txnRef),
        launchFailed: launchFailed === "1",
        needsAnswer,
      });
      if (line) Speech.speak(line, { language: lang });
    });
  }, [entry, needsAnswer, launchFailed]);

  return (
    <Screen>
      <RehearsalBanner />
      {entry && isRehearsalRef(entry.txnRef) && <Notice tone="info" text={strings.rehearsal.receiptNote} />}
      {recovered === "1" && <Notice tone="info" text={s.recovered} />}
      {launchFailed === "1" && <Notice text={strings.confirm.noUpiApp} />}
      {entry === undefined ? (
        <Text style={ui.muted}>{strings.common.loading}</Text>
      ) : entry === null ? (
        <Text style={ui.body}>—</Text>
      ) : (
        <Card>
          <View style={[styles.icon, { backgroundColor: statusColor[entry.status] }]}>
            <Text style={styles.iconText}>{statusIcon[entry.status]}</Text>
          </View>
          <Text style={[styles.status, { color: statusColor[entry.status] }]}>{strings.status[entry.status]}</Text>
          <Row label={s.amount} value={formatRupees(entry.amountPaise)} big />
          <Row label={s.to} value={entry.payeeName} />
          <Row label={s.time} value={formatIstDateTime(entry.createdAt)} />
          <Row label={s.reference} value={entry.txnRef} />
        </Card>
      )}

      {needsAnswer ? (
        <View style={ui.gap}>
          <Text style={styles.question}>{s.question}</Text>
          <Text style={ui.muted}>{s.questionHint}</Text>
          <Button label={s.wentThrough} onPress={() => answer("success")} disabled={saving} />
          <Button variant="secondary" label={s.didNotGoThrough} onPress={() => answer("failed")} disabled={saving} />
        </View>
      ) : (
        <View style={ui.gap}>
          {suggested && payeeExists && (
            <Button
              variant="secondary"
              label={strings.suggest.monthly(formatWhen(suggested, nextReminderAt(suggested, Date.now())))}
              onPress={remindMonthly}
            />
          )}
          {entry && payeeExists && (
            <Button label={s.payAgain(entry.payeeName, formatRupees(entry.amountPaise))} onPress={payAgain} />
          )}
          {/* A rehearsal receipt is never shared: it would look like a real payment. */}
          {entry && !isRehearsalRef(entry.txnRef) && (
            <Button variant="secondary" label={s.share} onPress={() => shareReceipt(entry)} />
          )}
          <Button variant={entry && payeeExists ? "secondary" : "primary"} label={strings.common.home} onPress={goHome} />
        </View>
      )}
    </Screen>
  );
}

function shareReceipt(entry: HistoryEntry) {
  Share.share({
    message: s.shareText({
      status: strings.status[entry.status],
      amount: formatRupees(entry.amountPaise),
      name: entry.payeeName,
      time: formatIstDateTime(entry.createdAt),
      txnRef: entry.txnRef,
    }),
  }).catch(() => {});
}

function Row({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={ui.muted}>{label}</Text>
      <Text style={[styles.value, big && styles.big]} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  status: { fontSize: 32, fontFamily: fonts.bold, textAlign: "center" },
  icon: { alignSelf: "center", width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center" },
  iconText: { fontSize: 52, lineHeight: 60, fontFamily: fonts.bold, color: colors.primaryText },
  row: { gap: 2, marginTop: spacing.sm },
  value: { fontSize: fontSize.body, color: colors.text, fontFamily: fonts.bold },
  big: { fontSize: 28 },
  question: { fontSize: fontSize.button, fontFamily: fonts.bold },
});
