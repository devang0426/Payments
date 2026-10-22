// "Which Mummy?" — shown when more than one saved payee matches the spoken name.
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet } from "react-native";

import { Card, Notice, Screen, Text, ui } from "@/components/ui";
import { confirmFor, decodeAmount } from "@/lib/flow";
import { formatRupees, maskVpa } from "@/lib/format";
import { matchPayees } from "@/lib/match";
import type { Payee } from "@/lib/payees";
import { txnRefFor } from "@/lib/rehearsal";
import { historyStore, payeeStore, rehearsal } from "@/lib/stores";
import { strings } from "@/lib/strings";
import { fontSize, fonts } from "@/lib/theme";

export default function ChooseScreen() {
  const params = useLocalSearchParams<{ name: string; amount: string }>();
  const name = String(params.name ?? "");
  const amount = decodeAmount(params.amount);
  const navigation = useNavigation();
  const [payees, setPayees] = useState<Payee[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: strings.choose.title(name) });
    payeeStore.load().then(({ payees: all }) => {
      const match = matchPayees(name, all);
      setPayees(match.kind === "many" ? match.payees : match.kind === "one" ? [match.payee] : []);
    });
  }, [name, navigation]);

  async function pick(payee: Payee) {
    if (!amount) return;
    const { entries, corrupt } = await historyStore.load();
    const result = confirmFor({ payee, amount, history: entries, historyUnreadable: corrupt, now: Date.now() });
    if (result.kind === "noPrevious") return setMessage(strings.home.noPrevious(payee.displayName));
    if (result.kind !== "confirm") return;
    // Confirm runs the rules again itself; this only chooses the payee and the amount.
    const txnRef = txnRefFor(await rehearsal.load());
    router.replace({
      pathname: "/confirm",
      params: { payeeId: payee.id, amountPaise: String(result.amountPaise), txnRef },
    });
  }

  return (
    <Screen>
      <Text style={ui.body}>{strings.choose.hint}</Text>
      {amount?.kind === "paise" && <Text style={styles.amount}>{formatRupees(amount.paise)}</Text>}
      {message && <Notice tone="info" text={message} />}
      {payees === null ? (
        <Text style={ui.muted}>{strings.common.loading}</Text>
      ) : (
        payees.map((p) => (
          <Pressable key={p.id} accessibilityRole="button" onPress={() => pick(p)}>
            <Card>
              <Text style={styles.name}>{p.displayName}</Text>
              <Text style={ui.muted}>{maskVpa(p.vpa)}</Text>
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  amount: { fontSize: 32, fontFamily: fonts.bold },
  name: { fontSize: fontSize.button, fontFamily: fonts.bold },
});
