// The camera (expo-camera), used only to read a payee's UPI QR code in Settings → Add payee. Loaded
// optionally: a development build made before expo-camera was added has no native module, and then
// the scan screen says "not available" instead of crashing (like the in-app mic in voice.ts).
// Nothing seen by the camera is stored, logged or sent anywhere; only the parsed UPI ID fills the form.
import type * as CameraModule from "expo-camera";

let mod: typeof CameraModule | null = null;
try {
  mod = require("expo-camera") as typeof CameraModule;
} catch {
  mod = null; // a build without the native module
}

export const cameraModule = () => mod;
