import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";

import { Button, Card, Notice, Screen, ui } from "@/components/ui";
import { formatIstDateTime, formatRupees } from "@/lib/format";
import type { HistoryEntry, PaymentStatus } from "@/lib/history";
import { paymentInFlight } from "@/lib/pay";
import { historyStore, payeeStore } from "@/lib/stores";
import { strings } from "@/lib/strings";
import { colors, fontSize, spacing } from "@/lib/theme";
import { makeTxnRef } from "@/lib/upi";

const s = strings.receipt;

const statusColor: Record<PaymentStatus, string> = {
  success: colors.success,
  failed: colors.danger,
  unknown: colors.muted,
  pending: colors.muted,
};

export default function ReceiptScreen() {
  const { txnRef = "", recovered, launchFailed } = useLocalSearchParams<{
    txnRef: string;
    recovered?: string;
    launchFailed?: string;
  }>();
  const [entry, setEntry] = useState<HistoryEntry | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const [payeeExists, setPayeeExists] = useState(false);

  const load = useCallback(() => {
    Promise.all([historyStore.load(), payeeStore.load()]).then(([{ entries }, { payees }]) => {
      const found = entries.find((e) => e.txnRef === txnRef) ?? null;
      setEntry(found);
      setPayeeExists(!!found && payees.some((p) => p.id === found.payeeId));
    });
  }, [txnRef]);

  // Same payee + amount, new txnRef. Goes to the Confirm card, which re-checks the rules.
  function payAgain() {
    if (!entry) return;
    router.replace({
      pathname: "/confirm",
      params: { payeeId: entry.payeeId, amountPaise: String(entry.amountPaise), txnRef: makeTxnRef() },
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

  return (
    <Screen>
      {recovered === "1" && <Notice tone="info" text={s.recovered} />}
      {launchFailed === "1" && <Notice text={strings.confirm.noUpiApp} />}
      {entry === undefined ? (
        <Text style={ui.muted}>{strings.common.loading}</Text>
      ) : entry === null ? (
        <Text style={ui.body}>—</Text>
      ) : (
        <Card>
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
          {entry && payeeExists && (
            <Button label={s.payAgain(entry.payeeName, formatRupees(entry.amountPaise))} onPress={payAgain} />
          )}
          {entry && <Button variant="secondary" label={s.share} onPress={() => shareReceipt(entry)} />}
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
  status: { fontSize: 32, fontWeight: "800" },
  row: { gap: 2, marginTop: spacing.sm },
  value: { fontSize: fontSize.body, color: colors.text, fontWeight: "600" },
  big: { fontSize: 28, fontWeight: "800" },
  question: { fontSize: fontSize.button, fontWeight: "700", color: colors.text },
});
