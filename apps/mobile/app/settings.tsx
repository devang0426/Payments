import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { Button, Card, Notice, Screen, SectionTitle, ui } from "@/components/ui";
import { formatRupees, maskVpa } from "@/lib/format";
import type { Payee } from "@/lib/payees";
import { DAILY_LIMIT_PAISE, sentTodayPaise } from "@/lib/rules";
import { historyStore, payeeStore } from "@/lib/stores";
import { strings } from "@/lib/strings";
import { colors, fontSize } from "@/lib/theme";
import { getIncludeTxnRef, getLastLaunch, setIncludeTxnRef, type LaunchDebug } from "@/lib/upiLaunch";

const s = strings.settings;
const SEED_PREFIX = "SEED";

export default function SettingsScreen() {
  const [payees, setPayees] = useState<Payee[]>([]);
  const [payeesCorrupt, setPayeesCorrupt] = useState(false);
  const [sentToday, setSentToday] = useState(0);
  const [historyCorrupt, setHistoryCorrupt] = useState(false);
  const [includeTr, setIncludeTr] = useState(getIncludeTxnRef());
  const [lastLaunch, setLastLaunch] = useState<LaunchDebug | null>(null);

  const reload = useCallback(async () => {
    setLastLaunch(getLastLaunch());
    const [p, h] = await Promise.all([payeeStore.load(), historyStore.load()]);
    setPayees(p.payees);
    setPayeesCorrupt(p.corrupt);
    setSentToday(sentTodayPaise(h.entries, Date.now()));
    setHistoryCorrupt(h.corrupt);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  function clearHistory() {
    Alert.alert(s.clearHistory, s.clearHistoryConfirm, [
      { text: strings.common.cancel, style: "cancel" },
      { text: s.clearHistory, style: "destructive", onPress: () => historyStore.clear().then(reload) },
    ]);
  }

  // DEV: three fake payments today (₹2,000 + ₹1,500 + ₹1,000 = ₹4,500) to test the daily limit.
  async function seedHistory() {
    const now = Date.now();
    for (const [i, amountPaise] of [200000, 150000, 100000].entries()) {
      await historyStore.add({
        txnRef: `${SEED_PREFIX}${now}${i}`,
        payeeId: "seed",
        payeeName: "Seed (fake)",
        amountPaise,
        status: "success",
        createdAt: now - i * 1000,
      });
    }
    reload();
  }

  return (
    <Screen>
      <Card>
        <Text style={styles.today}>{s.sentToday(formatRupees(sentToday), formatRupees(DAILY_LIMIT_PAISE))}</Text>
      </Card>

      {historyCorrupt && (
        <View style={ui.gap}>
          <Notice text={s.historyCorrupt} />
          <Button variant="danger" label={s.clearHistory} onPress={clearHistory} />
        </View>
      )}

      <View style={ui.gap}>
        <SectionTitle>{s.payeesTitle}</SectionTitle>
        {payeesCorrupt && <Notice text={s.payeesCorrupt} />}
        {payees.length === 0 && <Text style={ui.muted}>{s.noPayees}</Text>}
        {payees.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/payee-edit", params: { id: p.id } })}
          >
            <Card>
              <Text style={styles.name}>{p.displayName}</Text>
              <Text style={ui.muted}>{maskVpa(p.vpa)}</Text>
              {p.aliases.length > 0 && <Text style={ui.muted}>{p.aliases.join(", ")}</Text>}
            </Card>
          </Pressable>
        ))}
        <Button label={s.addPayee} onPress={() => router.push("/payee-edit")} />
      </View>

      {__DEV__ && (
        <View style={ui.gap}>
          <SectionTitle>{s.devTitle}</SectionTitle>
          <Button variant="secondary" label={s.seedHistory} onPress={seedHistory} />
          <Button
            variant="secondary"
            label={s.clearFake}
            onPress={() => historyStore.removeByTxnRefPrefix(SEED_PREFIX).then(reload)}
          />
          <Button variant="danger" label={s.clearAll} onPress={() => historyStore.clear().then(reload)} />
          <View style={ui.row}>
            <Text style={[ui.body, { flex: 1 }]}>{s.includeTr}</Text>
            <Switch
              value={includeTr}
              onValueChange={(v) => {
                setIncludeTxnRef(v);
                setIncludeTr(v);
              }}
            />
          </View>
          <Card>
            <Text style={ui.muted}>{s.lastLaunch}</Text>
            <Text style={styles.mono} selectable>
              {lastLaunch ? JSON.stringify(lastLaunch, null, 2) : s.noLaunchYet}
            </Text>
          </Card>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  today: { fontSize: fontSize.body, fontWeight: "700", color: colors.text },
  name: { fontSize: fontSize.button, fontWeight: "700", color: colors.text },
  mono: { fontFamily: "monospace", fontSize: 13, color: colors.text },
});
