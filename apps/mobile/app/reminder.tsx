// Reminder card (M13): "Remind you on 1 November to send ₹2,000 to Mummy?". Saved by a spoken strict
// yes (lib/voiceConfirm decideSaveVoice) or a tap on Save. Saving never pays: when it rings, the
// notification opens a normal Confirm card that asks and listens (rule 8).
// Stored structured (payeeId, paise, when), never the user's words.
import { router, useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button, Card, Notice, Screen, Text, ui } from "@/components/ui";
import { formatRupees, formatWhen } from "@/lib/format";
import type { Payee } from "@/lib/payees";
import { saveReminder, type SaveResult } from "@/lib/reminderRun";
import { WhenSchema, nextReminderAt, type When } from "@/lib/reminders";
import { speechTexts, type SpeechLang } from "@/lib/speech";
import { speechLanguage } from "@/lib/speechLang";
import { conversation, payeeStore } from "@/lib/stores";
import { strings } from "@/lib/strings";
import { colors, fontSize, fonts } from "@/lib/theme";
import { listenOnce, stopListening, voiceAvailable } from "@/lib/voice";
import { LISTEN_WINDOW_MS, decideSaveVoice, type SaveVoiceDecision } from "@/lib/voiceConfirm";

const s = strings.reminder;
const SETTLE_MS = 250;
const DEV_DELAY_MS = 2 * 60 * 1000;

const failText: Record<Exclude<SaveResult, "saved">, string> = {
  notificationsOff: s.notificationsOff,
  unavailable: s.unavailable,
  tooMany: s.tooMany,
  failed: s.failed,
};

function parseWhen(raw: string | undefined): When | null {
  try {
    const parsed = WhenSchema.safeParse(JSON.parse(String(raw)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

type Draft = { payee: Payee; amountPaise?: number; when: When; nextAt: number };

export default function ReminderScreen() {
  const params = useLocalSearchParams<{ payeeId: string; amountPaise?: string; when: string }>();
  const [draft, setDraft] = useState<Draft | null | "missing">(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [speechLang, setSpeechLang] = useState<SpeechLang | null>(null);

  const cardId = useRef(`rem-${Date.now()}`).current;
  const used = useRef(false); // saved or cancelled
  const alive = useRef(true);
  const listeningRef = useRef(false);
  const lastSpoken = useRef("");
  const saveRef = useRef<(devSoon: boolean) => void>(() => {});

  useEffect(() => {
    speechLanguage().then(setSpeechLang);
    payeeStore.load().then(({ payees }) => {
      const payee = payees.find((p) => p.id === params.payeeId);
      const when = parseWhen(params.when);
      const amount = /^\d{1,12}$/.test(String(params.amountPaise ?? "")) ? Number(params.amountPaise) : undefined;
      if (!payee || !when) return setDraft("missing");
      setDraft({ payee, ...(amount ? { amountPaise: amount } : {}), when, nextAt: nextReminderAt(when, Date.now()) });
    });
  }, [params.payeeId, params.amountPaise, params.when]);

  const ready = draft && draft !== "missing" ? draft : null;
  const texts = speechLang ? speechTexts(speechLang) : null;
  const question =
    ready && texts
      ? texts.reminderAsk(texts.when(ready.when, ready.nextAt), ready.payee.displayName, ready.amountPaise ? texts.rupees(ready.amountPaise) : null)
      : null;
  const voiceOn = voiceAvailable();

  function say(text: string, thenListen: boolean) {
    lastSpoken.current = text;
    Speech.stop();
    Speech.speak(text, {
      language: speechLang ?? "en-IN",
      onDone: () => {
        if (alive.current && thenListen && voiceOn) setTimeout(listenNow, SETTLE_MS);
      },
    });
  }

  async function listenNow() {
    if (!alive.current || listeningRef.current || used.current) return;
    listeningRef.current = true;
    setListening(true);
    setNote(null);
    const listenStartedAt = Date.now();
    const heard = await listenOnce({ timeoutMs: LISTEN_WINDOW_MS });
    const resultAt = Date.now();
    listeningRef.current = false;
    setListening(false);
    if (!alive.current || !heard.ok) return;
    act(
      decideSaveVoice({
        cardId,
        currentId: cardId,
        used: used.current,
        heard: { transcript: heard.transcript, forId: cardId, listenStartedAt, resultAt, lastSpoken: lastSpoken.current },
      }),
    );
  }

  function act(decision: SaveVoiceDecision) {
    const t = texts ?? speechTexts("en-IN");
    switch (decision.kind) {
      case "save":
        return saveRef.current(false);
      case "cancel":
        return cancel(true);
      case "pause":
        setNote(strings.voice.paused);
        return say(t.paused, false);
      case "notClear":
        return setNote(s.notClear);
      case "ignore":
        return;
    }
  }

  useEffect(() => {
    if (!question) return;
    alive.current = true;
    say(question, true);
    return () => {
      alive.current = false;
      Speech.stop();
      stopListening();
    };
    // say() only reads refs; run once the question is known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question]);

  function cancel(spoken: boolean) {
    used.current = true;
    alive.current = false;
    stopListening();
    if (spoken) Speech.speak((texts ?? speechTexts("en-IN")).cancelled, { language: speechLang ?? "en-IN" });
    else Speech.stop();
    router.back();
  }

  async function save(devSoon: boolean) {
    if (!ready || used.current || saving) return;
    used.current = true;
    stopListening();
    Speech.stop();
    setSaving(true);
    const now = Date.now();
    const result = await saveReminder({ ...ready, nextAt: devSoon ? now + DEV_DELAY_MS : ready.nextAt }, now);
    setSaving(false);
    if (result !== "saved") {
      used.current = false; // nothing was saved: Save can be tapped again
      return setError(failText[result]);
    }
    conversation.reset();
    setDone(devSoon ? s.devSaved : s.saved(formatWhen(ready.when, ready.nextAt)));
    if (alive.current) say((texts ?? speechTexts("en-IN")).reminderSaved, false);
  }
  saveRef.current = save;

  if (draft === null) {
    return (
      <Screen>
        <Text style={ui.muted}>{strings.common.loading}</Text>
      </Screen>
    );
  }
  if (draft === "missing") {
    return (
      <Screen>
        <Notice text={strings.confirm.payeeMissing} />
        <Button variant="secondary" label={strings.common.back} onPress={() => router.back()} />
      </Screen>
    );
  }

  const whenText = formatWhen(draft.when, draft.nextAt);
  return (
    <Screen>
      <Card>
        <Text style={styles.question}>
          {s.question(whenText, draft.payee.displayName, draft.amountPaise ? formatRupees(draft.amountPaise) : null)}
        </Text>
        <Text style={ui.muted}>{s.hint}</Text>
      </Card>

      {done ? (
        <>
          <Notice tone="info" text={done} />
          <Button variant="secondary" label={strings.common.home} onPress={() => router.dismissAll()} />
        </>
      ) : (
        <View style={ui.gap}>
          {error && <Notice text={error} />}
          {listening && <Notice tone="info" text={s.listening} />}
          {note && !listening && <Text style={ui.muted}>{note}</Text>}
          <Button label={saving ? strings.common.loading : s.save} onPress={() => save(false)} disabled={saving} />
          {voiceOn && (
            <Button
              variant="secondary"
              label={listening ? strings.confirm.micListening : strings.confirm.mic}
              onPress={() => (listeningRef.current ? stopListening() : (Speech.stop(), setTimeout(listenNow, SETTLE_MS)))}
              disabled={saving}
            />
          )}
          {__DEV__ && <Button variant="secondary" label={s.devSoon} onPress={() => save(true)} disabled={saving} />}
          <Button variant="secondary" label={strings.common.cancel} onPress={() => cancel(false)} disabled={saving} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  question: { fontSize: fontSize.heading, fontFamily: fonts.bold, color: colors.text },
});
