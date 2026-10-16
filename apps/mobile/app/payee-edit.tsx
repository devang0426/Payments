// Add or edit a payee. Real UPI IDs are only ever typed here and kept in SecureStore on the phone.
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useState } from "react";
import { Alert } from "react-native";

import { Button, Field, Notice, Screen } from "@/components/ui";
import { payeeStore } from "@/lib/stores";
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

  useEffect(() => {
    navigation.setOptions({ title: id ? s.editTitle : s.addTitle });
    if (!id) return;
    payeeStore.load().then(({ payees }) => {
      const payee = payees.find((p) => p.id === id);
      if (!payee) return setError(s.errors.NOT_FOUND);
      setDisplayName(payee.displayName);
      setVpa(payee.vpa);
      setPhone(payee.phone ?? "");
      setAliases(payee.aliases.join(", "));
    });
  }, [id, navigation]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    const input = { displayName, vpa, phone, aliases: aliases.split(",") };
    const result = id ? await payeeStore.update(id, input) : await payeeStore.add(input);
    setSaving(false);
    if (!result.ok) return setError(s.errors[result.error]);
    router.back();
  }

  function remove() {
    if (!id) return;
    Alert.alert(s.deleteConfirm(displayName), undefined, [
      { text: strings.common.cancel, style: "cancel" },
      { text: s.delete, style: "destructive", onPress: () => payeeStore.remove(id).then(() => router.back()) },
    ]);
  }

  return (
    <Screen>
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
