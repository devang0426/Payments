import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { strings } from "@/lib/strings";
import { colors } from "@/lib/theme";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.text },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="confirm" options={{ title: strings.confirm.title }} />
        <Stack.Screen name="choose" options={{ title: "" }} />
        <Stack.Screen name="receipt" options={{ title: strings.receipt.title, headerBackVisible: false }} />
        <Stack.Screen name="settings" options={{ title: strings.settings.title }} />
        <Stack.Screen name="history" options={{ title: strings.history.title }} />
        <Stack.Screen name="payee-edit" options={{ title: strings.payeeEdit.addTitle }} />
      </Stack>
    </>
  );
}
