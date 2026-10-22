// check_upi_id (M13): a UPI ID typed or pasted on Home is never sent anywhere. This screen shows fixed
// facts about it from the phone's own payees (saved or not, since when, format, handle). Never a
// safety verdict: only PhonePe's bank-registered name can tell who owns it.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";

import { Button, Card, Notice, Screen, Text, ui } from "@/components/ui";
import { upiFactLines, upiIdFacts } from "@/lib/prefilter";
import { payeeStore } from "@/lib/stores";
import { strings } from "@/lib/strings";
import { fontSize, fonts } from "@/lib/theme";

const s = strings.upiCheck;

export default function UpiCheckScreen() {
  const { vpa } = useLocalSearchParams<{ vpa: string }>();
  const id = String(vpa ?? "").slice(0, 300);
  const [lines, setLines] = useState<string[] | null>(null);

  useEffect(() => {
    payeeStore.load().then(({ payees }) => setLines(upiFactLines(upiIdFacts(id, payees))));
  }, [id]);

  return (
    <Screen>
      <Notice tone="info" text={s.blockedText} />
      <Card>
        <Text style={{ fontSize: fontSize.heading, fontFamily: fonts.bold }}>{id}</Text>
        {lines === null ? (
          <Text style={ui.muted}>{strings.common.loading}</Text>
        ) : (
          lines.map((line, i) => (
            <Text key={i} style={i === lines.length - 1 ? [ui.body, ui.bold] : ui.body}>
              {line}
            </Text>
          ))
        )}
      </Card>
      <Button variant="secondary" label={strings.common.goToSettings} onPress={() => router.push("/settings")} />
      <Button variant="secondary" label={strings.common.home} onPress={() => router.dismissAll()} />
    </Screen>
  );
}
