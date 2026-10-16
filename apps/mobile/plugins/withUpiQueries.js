// Android package visibility (Android 11+): declare that FlowPay opens upi:// links, so UPI apps
// like PhonePe are visible to the app in development and release builds.
const { withAndroidManifest } = require("expo/config-plugins");

module.exports = function withUpiQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const intent = {
      action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
      data: [{ $: { "android:scheme": "upi" } }],
    };
    manifest.queries = manifest.queries ?? [{}];
    const queries = manifest.queries[0];
    queries.intent = queries.intent ?? [];
    const exists = queries.intent.some((i) => i.data?.some((d) => d.$?.["android:scheme"] === "upi"));
    if (!exists) queries.intent.push(intent);
    return cfg;
  });
};
