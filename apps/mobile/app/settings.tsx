import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, View } from "react-native";

import { Button, Card, Field, Notice, Screen, SectionTitle, Text, ui } from "@/components/ui";
import { deviceAuth } from "@/lib/deviceAuthNative";
import { formatRupees, formatWhen, lastFour, maskVpa } from "@/lib/format";
import { makeHelper, type Helper } from "@/lib/helper";
import type { Payee } from "@/lib/payees";
import { REHEARSAL_PREFIX, isRehearsalRef } from "@/lib/rehearsal";
import { deleteReminder } from "@/lib/reminderRun";
import type { Reminder } from "@/lib/reminders";
import { DAILY_LIMIT_PAISE, sentTodayPaise } from "@/lib/rules";
import type { Prefs } from "@/lib/preferences";
import { helperStore, historyStore, payeeStore, prefsStore, rehearsal, reminderStore } from "@/lib/stores";
import { strings } from "@/lib/strings";
import { colors, fontSize, fonts } from "@/lib/theme";
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
  const [rehearsalOn, setRehearsalOn] = useState(rehearsal.get());
  const [rehearsalCount, setRehearsalCount] = useState(0);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [helper, setHelper] = useState<Helper | null>(null);
  const [editingHelper, setEditingHelper] = useState(false);
  const [helperName, setHelperName] = useState("");
  const [helperPhone, setHelperPhone] = useState("");
  const [helperError, setHelperError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(prefsStore.get());

  async function changePrefs(next: Prefs) {
    setPrefs(next);
    await prefsStore.set(next);
  }

  const reload = useCallback(async () => {
    setLastLaunch(getLastLaunch());
    const [p, h, on, r, hp] = await Promise.all([
      payeeStore.load(),
      historyStore.load(),
      rehearsal.load(),
      reminderStore.list(),
      helperStore.load(),
    ]);
    setHelper(hp);
    setPrefs(prefsStore.get());
    setReminders([...r].sort((a, b) => a.nextAt - b.nextAt));
    setPayees(p.payees);
    setPayeesCorrupt(p.corrupt);
    setSentToday(sentTodayPaise(h.entries, Date.now()));
    setHistoryCorrupt(h.corrupt);
    setRehearsalOn(on);
    setRehearsalCount(h.entries.filter((e) => isRehearsalRef(e.txnRef)).length);
  }, []);

  async function toggleRehearsal(value: boolean) {
    await rehearsal.set(value).catch(() => {});
    reload();
  }

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  // Family helper (M17): saving or removing needs the fingerprint/PIN, like a payee (M10).
  async function confirmIsYou(): Promise<boolean> {
    const auth = await deviceAuth.confirm(strings.helper.authPrompt);
    if (auth === "ok") return true;
    setHelperError(auth === "noLock" ? strings.helper.authNoLock : auth === "cancelled" ? null : strings.helper.authFailed);
    return false;
  }

  function editHelper() {
    setHelperName(helper?.name ?? "");
    setHelperPhone(helper ? helper.phone.slice(3) : "");
    setHelperError(null);
    setEditingHelper(true);
  }

  async function saveHelper() {
    const made = makeHelper({ name: helperName, phone: helperPhone });
    if (!made.ok) return setHelperError(made.error === "INVALID_NAME" ? strings.helper.invalidName : strings.helper.invalidPhone);
    if (!(await confirmIsYou())) return;
    await helperStore.save(made.helper);
    setEditingHelper(false);
    reload();
  }

  async function removeHelper() {
    setHelperError(null);
    if (!(await confirmIsYou())) return;
    await helperStore.clear();
    reload();
  }

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

      <Button variant="secondary" label={strings.readyCheck.open} onPress={() => router.push("/ready-check")} />

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

      <View style={ui.gap}>
        <SectionTitle>{strings.helper.title}</SectionTitle>
        <Text style={ui.muted}>{strings.helper.hint}</Text>
        {helperError && <Notice text={helperError} />}
        {editingHelper ? (
          <Card>
            <Field label={strings.helper.name} value={helperName} onChangeText={setHelperName} maxLength={50} />
            <Field
              label={strings.helper.phone}
              value={helperPhone}
              onChangeText={setHelperPhone}
              keyboardType="phone-pad"
              maxLength={16}
            />
            <Button label={strings.helper.save} onPress={saveHelper} />
            <Button
              variant="secondary"
              label={strings.common.cancel}
              onPress={() => {
                setEditingHelper(false);
                setHelperError(null);
              }}
            />
          </Card>
        ) : helper ? (
          <Card>
            <Text style={styles.name}>{helper.name}</Text>
            <Text style={ui.muted}>
              {strings.confirm.phone}: {lastFour(helper.phone)}
            </Text>
            <Button variant="secondary" label={strings.helper.change} onPress={editHelper} />
            <Button variant="danger" label={strings.helper.remove} onPress={removeHelper} />
          </Card>
        ) : (
          <>
            <Text style={ui.muted}>{strings.helper.none}</Text>
            <Button variant="secondary" label={strings.helper.add} onPress={editHelper} />
          </>
        )}
      </View>

      <View style={ui.gap}>
        <SectionTitle>{strings.prefs.title}</SectionTitle>
        <View style={ui.row}>
          <Text style={[ui.body, { flex: 1 }]}>{strings.prefs.speakReplies}</Text>
          <Switch value={prefs.speakReplies} onValueChange={(v) => changePrefs({ ...prefs, speakReplies: v })} trackColor={{ true: colors.primary }} />
        </View>
        <Text style={ui.muted}>{strings.prefs.speakHint}</Text>
        <Text style={ui.body}>{strings.prefs.replyLanguage}</Text>
        <View style={styles.pills}>
          {(["auto", "en", "hi"] as const).map((lang) => (
            <Pressable
              key={lang}
              accessibilityRole="button"
              accessibilityState={{ selected: prefs.replyLanguage === lang }}
              onPress={() => changePrefs({ ...prefs, replyLanguage: lang })}
              style={[styles.pill, prefs.replyLanguage === lang && styles.pillOn]}
            >
              <Text style={[styles.pillText, prefs.replyLanguage === lang && styles.pillTextOn]}>
                {lang === "auto" ? strings.prefs.auto : lang === "en" ? strings.prefs.english : strings.prefs.hindi}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={ui.gap}>
        <SectionTitle>{strings.reminder.listTitle}</SectionTitle>
        {reminders.length === 0 && <Text style={ui.muted}>{strings.reminder.none}</Text>}
        {reminders.map((r) => {
          const name = payees.find((p) => p.id === r.payeeId)?.displayName ?? "—";
          return (
            <Card key={r.id}>
              <Text style={ui.body}>
                {strings.reminder.row(name, r.amountPaise ? formatRupees(r.amountPaise) : null, formatWhen(r.when, r.nextAt))}
              </Text>
              <Button variant="secondary" label={strings.reminder.delete} onPress={() => deleteReminder(r.id).then(reload)} />
            </Card>
          );
        })}
      </View>

      <View style={ui.gap}>
        <SectionTitle>{strings.rehearsal.title}</SectionTitle>
        <View style={ui.row}>
          <Text style={[ui.body, { flex: 1 }]}>{strings.rehearsal.switchLabel}</Text>
          <Switch value={rehearsalOn} onValueChange={toggleRehearsal} trackColor={{ true: colors.primary }} />
        </View>
        <Text style={ui.muted}>{strings.rehearsal.hint}</Text>
        {rehearsalCount > 0 && (
          <Button
            variant="secondary"
            label={strings.rehearsal.clear(rehearsalCount)}
            onPress={() => historyStore.removeByTxnRefPrefix(REHEARSAL_PREFIX).then(reload)}
          />
        )}
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
  today: { fontSize: fontSize.body, fontFamily: fonts.bold },
  name: { fontSize: fontSize.button, fontFamily: fonts.bold },
  mono: { fontFamily: "monospace", fontSize: 13, color: colors.text },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  pillOn: { backgroundColor: colors.primary },
  pillText: { color: colors.primary, fontFamily: fonts.bold, fontSize: fontSize.body },
  pillTextOn: { color: colors.primaryText },
});
