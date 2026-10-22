// Shared building blocks: big, high-contrast controls so parents can use the app too. The look
// (colours, font, pill buttons, white cards) comes from the UI design, FlowPay.html.
import type { ReactNode } from "react";
import {
  Pressable,
  Text as RNText,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, fontSize, fonts, radius, spacing } from "@/lib/theme";

// Text in the app font. Use it instead of React Native's Text; for bold text use ui.bold
// (fonts.bold), not fontWeight.
export function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.text, style]} />;
}

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

// Red card for blocked payments and errors; amber for "allowed, but check" (M13); soft purple for
// neutral information.
export function Notice({ title, text, tone = "danger" }: { title?: string; text: string; tone?: "danger" | "warning" | "info" }) {
  const box = tone === "danger" ? styles.noticeDanger : tone === "warning" ? styles.noticeWarning : styles.noticeInfo;
  const color = tone === "danger" ? styles.dangerText : tone === "warning" ? styles.warningText : null;
  return (
    <View style={[styles.notice, box]}>
      {title && <Text style={[styles.noticeTitle, color]}>{title}</Text>}
      <Text style={[styles.noticeText, color]}>{text}</Text>
    </View>
  );
}

export function Field({ label, ...input }: { label: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={ui.input} {...input} />
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export const ui = StyleSheet.create({
  muted: { fontSize: fontSize.label, color: colors.muted },
  body: { fontSize: fontSize.body, color: colors.text },
  bold: { fontFamily: fonts.bold },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  gap: { gap: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.body,
    fontFamily: fonts.regular,
    color: colors.text,
  },
});

const styles = StyleSheet.create({
  text: { fontFamily: fonts.regular, color: colors.text },
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, gap: spacing.lg },
  button: {
    minHeight: 64,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: colors.primary },
  secondary: { borderWidth: 2, borderColor: colors.text },
  dangerButton: { backgroundColor: colors.danger },
  dim: { opacity: 0.5 },
  buttonText: { fontSize: fontSize.button, fontFamily: fonts.bold, textAlign: "center" },
  primaryText: { color: colors.primaryText },
  secondaryText: { color: colors.text },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  notice: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs, borderWidth: 2 },
  noticeDanger: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  noticeInfo: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  noticeWarning: { backgroundColor: colors.warningSoft, borderColor: colors.warning },
  noticeTitle: { fontSize: fontSize.button, fontFamily: fonts.bold },
  noticeText: { fontSize: fontSize.body, lineHeight: 25 },
  dangerText: { color: colors.danger },
  warningText: { color: colors.warning },
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.label, color: colors.muted },
  sectionTitle: { fontSize: fontSize.button, fontFamily: fonts.bold },
});
