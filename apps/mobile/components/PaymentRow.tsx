import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatIstDateTime, formatRupees } from "@/lib/format";
import type { HistoryEntry } from "@/lib/history";
import { strings } from "@/lib/strings";
import { colors, fontSize } from "@/lib/theme";

import { Card, ui } from "./ui";

// One payment in a list; tapping it opens its receipt.
export function PaymentRow({ entry }: { entry: HistoryEntry }) {
  const statusColor =
    entry.status === "success" ? colors.success : entry.status === "failed" ? colors.danger : colors.muted;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/receipt", params: { txnRef: entry.txnRef } })}
    >
      <Card>
        <View style={ui.row}>
          <Text style={styles.name}>{entry.payeeName}</Text>
          <Text style={styles.amount}>{formatRupees(entry.amountPaise)}</Text>
        </View>
        <View style={ui.row}>
          <Text style={ui.muted}>{formatIstDateTime(entry.createdAt)}</Text>
          <Text style={[ui.muted, { color: statusColor }]}>{strings.status[entry.status]}</Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: fontSize.body, fontWeight: "600", color: colors.text, flexShrink: 1 },
  amount: { fontSize: fontSize.body, fontWeight: "700", color: colors.text },
});
