// Ready check: run before a demo. Each row is ✅ or ❌ with a one-line fix.
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button, Card, Notice, Screen, Text, ui } from "@/components/ui";
import { formatRupees } from "@/lib/format";
import { allReady, readyRows, type ReadyFacts, type ReadyRow } from "@/lib/readyCheck";
import { gatherReadyFacts } from "@/lib/readyCheckRun";
import { strings } from "@/lib/strings";
import { colors, fontSize, fonts } from "@/lib/theme";

const s = strings.readyCheck;

export default function ReadyCheckScreen() {
  const [result, setResult] = useState<{ facts: ReadyFacts; rows: ReadyRow[] } | null>(null);
  const [running, setRunning] = useState(true);

  const check = useCallback(
    () =>
      gatherReadyFacts().then((facts) => {
        setResult({ facts, rows: readyRows(facts) });
        setRunning(false);
      }),
    [],
  );

  useEffect(() => {
    check();
  }, [check]);

  function runAgain() {
    setRunning(true);
    check();
  }

  const toFix = result ? result.rows.filter((r) => !r.ok).length : 0;

  return (
    <Screen>
      {running || !result ? (
        <Text style={ui.muted}>{s.running}</Text>
      ) : (
        <Notice tone={allReady(result.rows) ? "info" : "danger"} text={toFix === 0 ? s.allGood : s.toFix(toFix)} />
      )}

      {result?.rows.map((row) => (
        <Card key={row.id}>
          <View style={ui.row}>
            <Text style={[styles.mark, { color: row.ok ? colors.success : colors.danger }]}>{row.ok ? "✅" : "❌"}</Text>
            <Text style={styles.label}>{s.rows[row.id].label}</Text>
          </View>
          {row.id === "limit" && <Text style={ui.muted}>{s.limitLeft(formatRupees(result.facts.remainingPaise))}</Text>}
          {!row.ok && <Text style={ui.body}>{s.rows[row.id].fix}</Text>}
        </Card>
      ))}

      <Button label={s.runAgain} onPress={runAgain} disabled={running} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  mark: { fontSize: fontSize.button },
  label: { flex: 1, fontSize: fontSize.body, fontFamily: fonts.bold },
});
