// Scan a payee's UPI QR (Settings → Add payee → Scan, or Home → "Add payee (QR)"). The QR only fills
// the form (lib/upi parseUpiQr: the UPI ID + a suggested name; any amount in it is ignored); saving
// still needs the fingerprint/PIN and the 24 h new-payee limit applies. Nothing the camera sees is
// stored or sent. then=add (from Home): open the Add payee form next instead of going back to it.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { Button, Notice, Screen, Text, ui } from "@/components/ui";
import { cameraModule } from "@/lib/camera";
import { qrHandoff } from "@/lib/stores";
import { strings } from "@/lib/strings";
import { colors, radius } from "@/lib/theme";
import { parseUpiQr } from "@/lib/upi";

const s = strings.scanQr;

export default function ScanQrScreen() {
  const { then } = useLocalSearchParams<{ then?: string }>();
  const cam = cameraModule();
  const [permission, setPermission] = useState<"asking" | "granted" | "denied">("asking");
  const [problem, setProblem] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (!cam) return;
    cam.Camera.requestCameraPermissionsAsync()
      .then((p) => setPermission(p.granted ? "granted" : "denied"))
      .catch(() => setPermission("denied"));
  }, [cam]);

  // Called for every frame with a QR in view: the first valid UPI QR wins; others keep scanning.
  function onScanned({ data }: { data: string }) {
    if (done.current) return;
    const result = parseUpiQr(data);
    if (!result.ok) return setProblem(s.reasons[result.reason]);
    done.current = true;
    qrHandoff.set(result);
    if (then === "add") router.replace("/payee-edit"); // the form takes the scan when it opens
    else router.back();
  }

  if (!cam) {
    return (
      <Screen>
        <Notice tone="info" text={s.unavailable} />
        <Button variant="secondary" label={strings.common.back} onPress={() => router.back()} />
      </Screen>
    );
  }

  if (permission !== "granted") {
    return (
      <Screen>
        {permission === "asking" ? (
          <Text style={ui.muted}>{s.asking}</Text>
        ) : (
          <>
            <Notice text={s.denied} />
            <Button variant="secondary" label={s.openSettings} onPress={() => Linking.openSettings().catch(() => {})} />
          </>
        )}
        <Button variant="secondary" label={strings.common.back} onPress={() => router.back()} />
      </Screen>
    );
  }

  const { CameraView } = cam;
  return (
    <Screen>
      <Text style={ui.body}>{s.hint}</Text>
      <View style={styles.frame}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={onScanned}
        />
      </View>
      {problem && <Notice text={problem} />}
      <Button variant="secondary" label={strings.common.cancel} onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: 360,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.text,
  },
});
