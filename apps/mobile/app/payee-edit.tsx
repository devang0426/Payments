// Add or edit a payee. Real UPI IDs are only ever typed (or scanned from the payee's UPI QR) here and
// kept in SecureStore on the phone. Every save or delete first needs the phone's fingerprint / PIN
// (lib/deviceAuth.ts). A scan only fills the fields; nothing is saved until Save.
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";

import { Button, Field, Notice, Screen } from "@/components/ui";
import { deviceAuth } from "@/lib/deviceAuthNative";
import { payeeStore, qrHandoff } from "@/lib/stores";
import { strings } from "@/lib/strings";

const s = strings.payeeEdit;

export default function PayeeEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const navigation = useNavigation();
  const [displayName, setDisplayName] = useState("");
  const [vpa, setVpa] = useState("");
  const [phone, setPhone] = useState("");
  const [aliases, setAliases] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const savedVpa = useRef<string | null>(null); // the UPI ID before editing (edit mode)

  useEffect(() => {
    navigation.setOptions({ title: id ? s.editTitle : s.addTitle });
    if (!id) return;
    payeeStore.load().then(({ payees }) => {
      const payee = payees.find((p) => p.id === id);
      if (!payee) return setError(s.errors.NOT_FOUND);
      savedVpa.current = payee.vpa;
      setDisplayName(payee.displayName);
      setVpa(payee.vpa);
      setPhone(payee.phone ?? "");
      setAliases(payee.aliases.join(", "));
    });
  }, [id, navigation]);

  // Back from the scanner: fill the UPI ID; the QR's name only if no name is typed yet.
  useFocusEffect(
    useCallback(() => {
      const scanned = qrHandoff.take();
      if (!scanned) return;
      setVpa(scanned.vpa);
      if (scanned.name) setDisplayName((current) => (current.trim() ? current : scanned.name!));
      const notes = [s.scanned, scanned.merchant ? s.scannedShop : null, savedVpa.current && savedVpa.current !== scanned.vpa ? s.scannedNewVpa : null];
      setScanNote(notes.filter(Boolean).join(" "));
      setError(null);
    }, []),
  );

  // true only after a successful fingerprint / PIN; otherwise says why (a cancel just does nothing).
  async function confirmIdentity(): Promise<boolean> {
    const auth = await deviceAuth.confirm(s.authPrompt);
    if (auth === "noLock") setError(s.authNoLock);
    else if (auth === "failed") setError(s.authFailed);
    return auth === "ok";
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    if (!(await confirmIdentity())) return setSaving(false);
    const input = { displayName, vpa, phone, aliases: aliases.split(",") };
    const result = id ? await payeeStore.update(id, input) : await payeeStore.add(input);
    setSaving(false);
    if (!result.ok) return setError(s.errors[result.error]);
    router.back();
  }

  async function removeConfirmed(payeeId: string) {
    setError(null);
    if (!(await confirmIdentity())) return;
    await payeeStore.remove(payeeId);
    router.back();
  }

  function remove() {
    if (!id) return;
    Alert.alert(s.deleteConfirm(displayName), undefined, [
      { text: strings.common.cancel, style: "cancel" },
      { text: s.delete, style: "destructive", onPress: () => removeConfirmed(id) },
    ]);
  }

  return (
    <Screen>
      <Button variant="secondary" label={s.scan} onPress={() => router.push("/scan-qr")} disabled={saving} />
      {scanNote && <Notice tone="info" text={scanNote} />}
      <Field label={s.name} value={displayName} onChangeText={setDisplayName} placeholder={s.namePlaceholder} />
      <Field
        label={s.vpa}
        value={vpa}
        onChangeText={setVpa}
        placeholder={s.vpaPlaceholder}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
      <Field label={s.phone} value={phone} onChangeText={setPhone} placeholder={s.phonePlaceholder} keyboardType="phone-pad" />
      <Field
        label={s.aliases}
        value={aliases}
        onChangeText={setAliases}
        placeholder={s.aliasesPlaceholder}
        autoCapitalize="none"
      />
      {error && <Notice text={error} />}
      <Button label={s.save} onPress={save} disabled={saving} />
      {id && <Button variant="danger" label={s.delete} onPress={remove} />}
    </Screen>
  );
}
