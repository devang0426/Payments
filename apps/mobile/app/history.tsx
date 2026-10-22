// All payments on this phone, newest first. History never leaves the phone.
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { PaymentRow } from "@/components/PaymentRow";
import { Card, Notice, Screen, Text, ui } from "@/components/ui";
import { formatRupees } from "@/lib/format";
import type { HistoryEntry } from "@/lib/history";
import { DAILY_LIMIT_PAISE, sentTodayPaise } from "@/lib/rules";
import { historyStore } from "@/lib/stores";
import { strings } from "@/lib/strings";

export default function HistoryScreen() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [corrupt, setCorrupt] = useState(false);
  const [now, setNow] = useState(0);

  useFocusEffect(
    useCallback(() => {
      historyStore.load().then((h) => {
        setEntries(h.entries);
        setCorrupt(h.corrupt);
        setNow(Date.now()); // "today" as of loading, not re-read on every render
      });
    }, []),
  );

  return (
    <Screen>
      {corrupt && <Notice text={strings.settings.historyCorrupt} />}
      {entries && (
        <Card>
          <Text style={ui.body}>
            {strings.settings.sentToday(formatRupees(sentTodayPaise(entries, now)), formatRupees(DAILY_LIMIT_PAISE))}
          </Text>
        </Card>
      )}
      {entries === null ? (
        <Text style={ui.muted}>{strings.common.loading}</Text>
      ) : entries.length === 0 ? (
        <Text style={ui.muted}>{strings.home.noRecent}</Text>
      ) : (
        entries.map((e) => <PaymentRow key={e.txnRef} entry={e} />)
      )}
    </Screen>
  );
}
