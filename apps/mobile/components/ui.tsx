// Shared building blocks: big, high-contrast controls so parents can use the app too.
import type { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, fontSize, radius, spacing } from "@/lib/theme";

export function Screen({ children, edges }: { children: ReactNode; edges?: ("top" | "bottom")[] }) {
  return (
    <SafeAreaView style={styles.safe} edges={edges ?? ["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
};

export function Button({ label, onPress, variant = "primary", disabled = false }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "danger" && styles.dangerButton,
        (pressed || disabled) && styles.dim,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === "secondary" ? styles.secondaryText : styles.primaryText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

// Red card for blocked payments and errors; blue-grey for neutral information.
export function Notice({ title, text, tone = "danger" }: { title?: string; text: string; tone?: "danger" | "info" }) {
  return (
    <View style={[styles.notice, tone === "danger" ? styles.noticeDanger : styles.noticeInfo]}>
      {title && <Text style={[styles.noticeTitle, tone === "danger" && styles.dangerText]}>{title}</Text>}
      <Text style={[styles.noticeText, tone === "danger" && styles.dangerText]}>{text}</Text>
    </View>
  );
}

export function Field({ label, ...input }: { label: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={styles.input} {...input} />
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export const ui = StyleSheet.create({
  muted: { fontSize: fontSize.label, color: colors.muted },
  body: { fontSize: fontSize.body, color: colors.text },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  gap: { gap: spacing.md },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, gap: spacing.lg },
  button: {
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.background, borderWidth: 2, borderColor: colors.primary },
  dangerButton: { backgroundColor: colors.danger },
  dim: { opacity: 0.5 },
  buttonText: { fontSize: fontSize.button, fontWeight: "700" },
  primaryText: { color: colors.primaryText },
  secondaryText: { color: colors.primary },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  notice: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs, borderWidth: 2 },
  noticeDanger: { backgroundColor: "#FEF2F2", borderColor: colors.danger },
  noticeInfo: { backgroundColor: colors.card, borderColor: colors.card },
  noticeTitle: { fontSize: fontSize.button, fontWeight: "700", color: colors.text },
  noticeText: { fontSize: fontSize.body, color: colors.text },
  dangerText: { color: colors.danger },
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.label, color: colors.muted },
  input: {
    borderWidth: 1,
    borderColor: colors.muted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.body,
    color: colors.text,
  },
  sectionTitle: { fontSize: fontSize.button, fontWeight: "700", color: colors.text },
});
