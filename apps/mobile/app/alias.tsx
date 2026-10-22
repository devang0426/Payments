// M15 "Maa matlab Mummy": add a nickname to a saved payee. Voice only proposes it; saving needs the
// phone's fingerprint/PIN (like every payee change, rule 6), and the name is checked again right
// before saving (lib/alias checkAlias: never a name that also reaches another payee).
import { router, useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";

import { Button, Card, Notice, Screen, Text, ui } from "@/components/ui";
import { checkAlias } from "@/lib/alias";
import { deviceAuth } from "@/lib/deviceAuthNative";
import type { Payee } from "@/lib/payees";
import { speechTexts } from "@/lib/speech";
import { speechLanguage } from "@/lib/speechLang";
import { payeeStore, prefsStore } from "@/lib/stores";
import { strings } from "@/lib/strings";
import { colors, fontSize, fonts } from "@/lib/theme";

const s = strings.alias;

export default function AliasScreen() {
  const { payeeId = "", alias = "" } = useLocalSearchParams<{ payeeId: string; alias: string }>();
  const [payee, setPayee] = useState<Payee | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    payeeStore.load().then(({ payees }) => {
      const found = payees.find((p) => p.id === payeeId) ?? null;
      setPayee(found);
      if (found && prefsStore.get().speakReplies) {
        speechLanguage().then((lang) => Speech.speak(speechTexts(lang).aliasAsk(alias, found.displayName), { language: lang }));
      }
    });
    return () => {
      Speech.stop();
    };
  }, [payeeId, alias]);

  async function add() {
    if (!payee || saving) return;
    setSaving(true);
    setError(null);
    try {
      const auth = await deviceAuth.confirm(s.authPrompt);
      if (auth !== "ok") {
        if (auth !== "cancelled") setError(auth === "noLock" ? s.authNoLock : s.authFailed);
        return;
      }
      // Read again: the payee (or another one) may have changed since the card opened.
      const { payees } = await payeeStore.load();
      const check = checkAlias(alias, payee.displayName, payees);
      if (!check.ok || check.payee.id !== payee.id) return setError(s.changed);
      const fresh = check.payee;
      const result = await payeeStore.update(fresh.id, {
        displayName: fresh.displayName,
        vpa: fresh.vpa, // unchanged, so the 24 h new-payee limit doesn't restart
        ...(fresh.phone ? { phone: fresh.phone } : {}),
        aliases: [...fresh.aliases, check.alias],
      });
      if (!result.ok) return setError(s.changed);
      setSaved(true);
      if (prefsStore.get().speakReplies) {
        const lang = await speechLanguage();
        Speech.speak(speechTexts(lang).aliasSaved(check.alias, fresh.displayName), { language: lang });
      }
    } finally {
      setSaving(false);
    }
  }

  if (payee === undefined) {
    return (
      <Screen>
        <Text style={ui.muted}>{strings.common.loading}</Text>
      </Screen>
    );
  }
  if (payee === null) {
    return (
      <Screen>
        <Notice text={strings.confirm.payeeMissing} />
        <Button variant="secondary" label={strings.common.home} onPress={() => router.dismissAll()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Text style={styles.question}>{saved ? s.saved(alias, payee.displayName) : s.ask(alias, payee.displayName)}</Text>
        {!saved && <Text style={ui.muted}>{s.hint(alias, payee.displayName)}</Text>}
      </Card>
      {error && <Notice text={error} />}
      {saved ? (
        <Button label={strings.common.home} onPress={() => router.dismissAll()} />
      ) : (
        <>
          <Button label={saving ? strings.common.loading : s.add} onPress={add} disabled={saving} />
          <Button variant="secondary" label={strings.common.cancel} onPress={() => router.back()} disabled={saving} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  question: { fontSize: fontSize.heading, fontFamily: fonts.bold, color: colors.text },
});
