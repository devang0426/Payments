import { AtkinsonHyperlegible_400Regular } from "@expo-google-fonts/atkinson-hyperlegible/400Regular";
import { AtkinsonHyperlegible_700Bold } from "@expo-google-fonts/atkinson-hyperlegible/700Bold";
import { useFonts } from "expo-font";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Alert } from "react-native";

import { openReminder, syncReminders } from "@/lib/reminderRun";
import { handleReminderTaps } from "@/lib/remindersNative";
import { prefsStore } from "@/lib/stores";
import { strings } from "@/lib/strings";
import { colors, fonts } from "@/lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // The fonts ship inside the app (no network). If they fail to load, the system font is used.
  const [loaded, error] = useFonts({
    [fonts.regular]: AtkinsonHyperlegible_400Regular,
    [fonts.bold]: AtkinsonHyperlegible_700Bold,
  });
  const ready = loaded || !!error;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // Reminders (M13): catch up on start, and open a tapped reminder as a normal Confirm card (or
  // "How much?" on Home). A reminder never pays by itself.
  useEffect(() => {
    if (!ready) return;
    prefsStore.load().catch(() => {}); // M15: reply language, speak replies
    syncReminders(Date.now()).catch(() => {});
    return handleReminderTaps(async (id) => {
      const target = await openReminder(id, Date.now()).catch(() => ({ kind: "gone" }) as const);
      if (target.kind === "confirm") {
        const { kind: _k, ...params } = target;
        router.push({ pathname: "/confirm", params: { ...params, amountPaise: String(params.amountPaise) } });
      } else if (target.kind === "askAmount") {
        router.navigate("/");
      } else if (target.kind === "noPayee") {
        Alert.alert(strings.reminder.title, strings.reminder.noPayee);
      }
    });
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.text, fontFamily: fonts.bold },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="confirm" options={{ title: strings.confirm.title }} />
        <Stack.Screen name="choose" options={{ title: "" }} />
        <Stack.Screen name="receipt" options={{ title: strings.receipt.title, headerBackVisible: false }} />
        <Stack.Screen name="settings" options={{ title: strings.settings.title }} />
        <Stack.Screen name="history" options={{ title: strings.history.title }} />
        <Stack.Screen name="ready-check" options={{ title: strings.readyCheck.title }} />
        <Stack.Screen name="payee-edit" options={{ title: strings.payeeEdit.addTitle }} />
        <Stack.Screen name="reminder" options={{ title: strings.reminder.title }} />
        <Stack.Screen name="upi-check" options={{ title: strings.upiCheck.title }} />
        <Stack.Screen name="alias" options={{ title: strings.alias.title }} />
        <Stack.Screen name="scan-qr" options={{ title: strings.scanQr.title }} />
      </Stack>
    </>
  );
}
