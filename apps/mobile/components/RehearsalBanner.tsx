import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { rehearsal } from "@/lib/stores";
import { strings } from "@/lib/strings";
import { colors, fontSize, fonts, radius, spacing } from "@/lib/theme";

import { Text } from "./ui";

// Full-width banner shown on Home, History, Confirm and Receipt while rehearsal mode is on.
export function RehearsalBanner() {
  const [on, setOn] = useState(rehearsal.get());

  useEffect(() => {
    const unsubscribe = rehearsal.subscribe(setOn);
    rehearsal.load();
    return unsubscribe;
  }, []);

  if (!on) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.text}>{strings.rehearsal.banner}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.rehearsal,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignSelf: "stretch",
  },
  text: { color: colors.primaryText, fontSize: fontSize.body, fontFamily: fonts.bold, textAlign: "center" },
});
