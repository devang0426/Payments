// "📞 Call Beta" (M17): shown when she is stuck (a red card, or Home not understanding her). Opens the
// phone's dialer with the family helper's number; she still presses call. Hidden when no helper is
// saved (Settings → Family helper).
import { useEffect, useState } from "react";
import { Alert, Linking } from "react-native";

import { Button } from "@/components/ui";
import { telUri, type Helper } from "@/lib/helper";
import { helperStore } from "@/lib/stores";
import { strings } from "@/lib/strings";

export function callHelper(helper: Helper) {
  Linking.openURL(telUri(helper)).catch(() => Alert.alert(strings.helper.title, strings.helper.callFailed));
}

export function CallHelperButton({ variant = "secondary" }: { variant?: "primary" | "secondary" }) {
  const [helper, setHelper] = useState<Helper | null>(null);
  useEffect(() => {
    let alive = true;
    helperStore.load().then((h) => alive && setHelper(h));
    return () => {
      alive = false;
    };
  }, []);
  if (!helper) return null;
  return <Button variant={variant} label={strings.helper.call(helper.name)} onPress={() => callHelper(helper)} />;
}
