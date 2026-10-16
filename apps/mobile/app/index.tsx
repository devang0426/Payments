import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { PaymentRow } from "@/components/PaymentRow";
import { Button, Notice, Screen, SectionTitle, ui } from "@/components/ui";
import { checkHealth, parseText, type HealthStatus } from "@/lib/api";
import { findContactByName } from "@/lib/contacts";
import { encodeAmount, resolvePayment } from "@/lib/flow";
import { getVoiceLang, listenOnce, setVoiceLang, stopListening, voiceAvailable, type VoiceLang } from "@/lib/voice";
import type { HistoryEntry } from "@/lib/history";
import { paymentInFlight } from "@/lib/pay";
import { historyStore, payeeStore } from "@/lib/stores";
import { strings } from "@/lib/strings";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { makeTxnRef } from "@/lib/upi";

const s = strings.home;

type Message = { text: string; showSettings: boolean; extra?: string };

const healthText: Record<HealthStatus | "checking", string> = {
  checking: s.serverChecking,
  ok: s.serverOk,
  down: s.serverDown,
  "not-configured": s.serverNotConfigured,
};

export default function HomeScreen() {
  const [typed, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceLang, setVoiceLangState] = useState<VoiceLang>(getVoiceLang());
  const micReady = voiceAvailable();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [recent, setRecent] = useState<HistoryEntry[]>([]);
  const [health, setHealth] = useState<HealthStatus | "checking">("checking");

  const recoveryChecked = useRef(false);

  useFocusEffect(
    useCallback(() => {
      historyStore.load().then(({ entries }) => setRecent(entries.slice(0, 5)));
      checkHealth().then(setHealth);

      // Once per app start: a payment still "pending" means FlowPay was closed while PhonePe was
      // open. Ask the user what happened (the oldest one first).
      if (!recoveryChecked.current) {
        recoveryChecked.current = true;
        historyStore.listPending().then((pending) => {
          const stuck = pending.filter((e) => e.txnRef !== paymentInFlight()).at(-1);
          if (stuck) router.push({ pathname: "/receipt", params: { txnRef: stuck.txnRef, recovered: "1" } });
        });
      }
    }, []),
  );

  // In-app mic (development/release build only). The live transcript fills the box; when the user
  // stops talking it goes straight to Next. The Confirm card still needs a Yes.
  async function speak() {
    if (busy || listening) return;
    setMessage(null);
    setListening(true);
    const heard = await listenOnce({ lang: voiceLang, onPartial: setText });
    setListening(false);
    if (heard.ok) {
      setText(heard.transcript);
      next(heard.transcript);
    } else if (heard.reason === "denied") {
      setMessage({ text: s.micDenied, showSettings: false });
    } else if (heard.reason !== "unavailable") {
      setMessage({ text: s.micNothing, showSettings: false });
    }
  }

  function toggleLang() {
    const nextLang = voiceLang === "en-IN" ? "hi-IN" : "en-IN";
    setVoiceLang(nextLang);
    setVoiceLangState(nextLang);
  }

  async function next(spoken?: string) {
    const text = spoken ?? typed;
    if (busy) return;
    setMessage(null);
    setBusy(true);
    try {
      // Only the text goes to the server; payees, contacts and history stay on the phone.
      const parsed = await parseText(text);
      if (!parsed.ok) {
        const reply = parsed.error === "NO_AMOUNT" ? s.noAmount : parsed.error === "NO_NAME" ? s.noName : s.failed;
        return setMessage({ text: reply, showSettings: false });
      }

      const [{ payees }, { entries, corrupt }] = await Promise.all([payeeStore.load(), historyStore.load()]);
      const result = resolvePayment({
        name: parsed.name,
        amount: parsed.amount,
        payees,
        history: entries,
        historyUnreadable: corrupt,
        now: Date.now(),
      });

      if (result.kind === "confirm") {
        router.push({
          pathname: "/confirm",
          params: { payeeId: result.payee.id, amountPaise: String(result.amountPaise), txnRef: makeTxnRef() },
        });
      } else if (result.kind === "choose") {
        router.push({ pathname: "/choose", params: { name: result.name, amount: encodeAmount(result.amount) } });
      } else if (result.kind === "noPrevious") {
        setMessage({ text: s.noPrevious(result.payee.displayName), showSettings: false });
      } else {
        const lookup = await findContactByName(result.name);
        setMessage(
          lookup === "found"
            ? { text: s.noUpiFor(result.name), showSettings: true }
            : { text: s.dontKnow(result.name), showSettings: true, extra: lookup === "denied" ? s.contactsDenied : undefined },
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={styles.hero}>
        <Text style={styles.title}>{strings.appName}</Text>
        <Text style={ui.muted}>{s.tagline}</Text>
      </View>

      <View style={ui.gap}>
        <Text style={styles.prompt}>{s.prompt}</Text>
        <TextInput
          style={styles.input}
          value={typed}
          onChangeText={setText}
          placeholder={s.placeholder}
          placeholderTextColor={colors.muted}
          multiline
          autoCorrect={false}
          returnKeyType="done"
          blurOnSubmit
          onSubmitEditing={() => next()}
          maxLength={300}
        />
        {micReady ? (
          <View style={ui.row}>
            <View style={{ flex: 1 }}>
              <Button
                label={listening ? s.listening : s.speak}
                onPress={listening ? stopListening : speak}
                disabled={busy}
              />
            </View>
            <Pressable accessibilityRole="button" onPress={toggleLang} disabled={listening} style={styles.lang}>
              <Text style={styles.langText}>{voiceLang === "en-IN" ? s.langEnglish : s.langHindi}</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={ui.muted}>{s.micTip}</Text>
        )}
        <Button
          variant={micReady ? "secondary" : "primary"}
          label={busy ? s.checking : s.next}
          onPress={() => next()}
          disabled={busy || listening || !typed.trim()}
        />
      </View>

      {message && (
        <View style={ui.gap}>
          <Notice tone="info" text={message.text} />
          {message.extra && <Text style={ui.muted}>{message.extra}</Text>}
          {message.showSettings && (
            <Button variant="secondary" label={strings.common.goToSettings} onPress={() => router.push("/settings")} />
          )}
        </View>
      )}

      <View style={ui.gap}>
        <SectionTitle>{s.recentTitle}</SectionTitle>
        {recent.length === 0 ? (
          <Text style={ui.muted}>{s.noRecent}</Text>
        ) : (
          <>
            {recent.map((e) => (
              <PaymentRow key={e.txnRef} entry={e} />
            ))}
            <Button variant="secondary" label={s.seeAll} onPress={() => router.push("/history")} />
          </>
        )}
      </View>

      <View style={styles.footer}>
        <Button variant="secondary" label={strings.common.settings} onPress={() => router.push("/settings")} />
        <Pressable onPress={() => { setHealth("checking"); checkHealth().then(setHealth); }}>
          <Text style={[ui.muted, { color: health === "ok" ? colors.success : health === "checking" ? colors.muted : colors.danger }]}>
            {s.serverLabel}: {healthText[health]}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: spacing.xs, marginTop: spacing.md },
  title: { fontSize: fontSize.title, fontWeight: "700", color: colors.primary },
  prompt: { fontSize: fontSize.body, fontWeight: "600", color: colors.text },
  input: {
    minHeight: 72,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.button,
    color: colors.text,
    textAlignVertical: "top",
  },
  lang: {
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  langText: { color: colors.primary, fontWeight: "700", fontSize: fontSize.body },
  footer: { gap: spacing.md, alignItems: "stretch", marginTop: spacing.md },
});
