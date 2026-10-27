// Everything the app SPEAKS, in English (en-IN) and Hindi (hi-IN). Pure. Screen text stays English
// (lib/strings.ts); when the mic is set to हिं and the phone has a Hindi voice, the app speaks Hindi
// (lib/speechLang.ts picks). Amounts are said as digits + rupees/रुपये, never with a ₹ sign.
import type { MessageId } from "./agent";
import type { AliasCheck } from "./alias";
import type { ExplainTexts } from "./explain";
import { formatWhen, spokenRupees } from "./format";
import type { When } from "./reminders";
import type { PaymentWarning, RuleFailure } from "./rules";
import { strings } from "./strings";

export type SpeechLang = "en-IN" | "hi-IN";

export type SpeechTexts = {
  rupees: (paise: number) => string;
  questions: Record<keyof typeof strings.conversation, string>;
  confirm: (amount: string, name: string) => string;
  rules: Record<RuleFailure, string>;
  dailyRemaining: (amount: string) => string;
  noPrevious: (name: string) => string;
  cancelled: string;
  paused: string;
  reask: (amount: string) => string;
  tapOnly: string;
  askAgain: string;
  offer: (amount: string) => string;
  // M13
  warnings: Record<PaymentWarning, (name: string) => string>;
  when: (when: When, nextAt: number) => string; // "on 1 November" / "every month on the 1st"
  reminderAsk: (when: string, name: string, amount: string | null) => string;
  reminderSaved: string;
  blocked: string;
  spending: (amount: string, count: number) => string;
  // M16
  nudge: string;
  failed: string;
  paid: (amount: string, name: string) => string;
  notPaid: string;
  noUpiApp: string;
  didItGo: string;
  rehearsalNote: string;
  dontKnow: (name: string) => string;
  noUpiFor: (name: string) => string;
  // M17
  helperAsk: (name: string) => string;
  helperCalling: (name: string) => string;
  // M14: the agent's fixed messages (never the model's own words) and its displays.
  tell: (message: MessageId, name?: string) => string;
  recent: (count: number) => string;
  amountFor: (name: string) => string; // polish: "How much should I send to Papa?"
  notClearAsk: string; // 2026-10-22: Confirm card, once, then the mic opens again
  fullAmountAsk: string;
  // M15
  explain: ExplainTexts;
  prefChanged: (key: string, value: string) => string;
  aliasAsk: (alias: string, name: string) => string;
  aliasSaved: (alias: string, name: string) => string;
  aliasRefused: (reason: Exclude<AliasCheck, { ok: true }>["reason"], alias: string, name: string) => string;
};

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const MONTHS_HI = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];
const istDate = (ms: number) => new Date(ms + IST_OFFSET_MS);

function whenHi(when: When, nextAt: number): string {
  if (when.kind === "monthly") return `हर महीने ${when.day} तारीख को`;
  const d = istDate(nextAt);
  return `${d.getUTCDate()} ${MONTHS_HI[d.getUTCMonth()]} को`;
}

function rupeesHi(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  const parts: string[] = [];
  if (rupees > 0) parts.push(`${rupees} ${rupees === 1 ? "रुपया" : "रुपये"}`);
  if (rest > 0) parts.push(`${rest} पैसे`);
  return parts.join(" ") || "0 रुपये";
}

const EN: SpeechTexts = {
  rupees: spokenRupees,
  questions: strings.conversation,
  confirm: strings.speech.confirm,
  rules: strings.speech.rules,
  dailyRemaining: strings.dailyRemaining,
  noPrevious: strings.home.noPrevious,
  cancelled: strings.voice.cancelled,
  paused: strings.voice.paused,
  reask: strings.voice.reask,
  tapOnly: strings.voice.tapOnly,
  askAgain: strings.voice.askAgain,
  offer: strings.voice.offer,
  warnings: strings.voice.warnings,
  when: formatWhen,
  reminderAsk: strings.voice.reminderAsk,
  reminderSaved: strings.voice.reminderSaved,
  blocked: strings.voice.blocked,
  spending: strings.voice.spending,
  nudge: strings.voice.nudge,
  failed: strings.home.failed,
  paid: strings.voice.paid,
  notPaid: strings.voice.notPaid,
  noUpiApp: strings.voice.noUpiApp,
  didItGo: strings.voice.didItGo,
  rehearsalNote: strings.rehearsal.receiptNote,
  dontKnow: strings.home.dontKnow,
  noUpiFor: strings.home.noUpiFor,
  helperAsk: strings.voice.helperAsk,
  helperCalling: strings.voice.helperCalling,
  tell: (message, name = "") =>
    message === "payee_saved"
      ? strings.agent.payeeSaved(name)
      : message === "payee_not_saved"
        ? strings.agent.payeeNotSaved(name)
        : strings.agent.tell[message],
  recent: strings.agent.recentSpoken,
  amountFor: strings.home.amountFor,
  notClearAsk: strings.voice.notClearAsk,
  fullAmountAsk: strings.voice.fullAmountAsk,
  // Spoken English = the screen text without quote marks (amounts arrive as "500 rupees").
  explain: { ...strings.explain, saidAs: (spoken, name) => `You said ${spoken}, which is saved as ${name}.` },
  prefChanged: (key, value) => strings.prefs.changed[`${key}:${value}`] ?? "Okay.",
  aliasAsk: (alias, name) => `Add ${alias} as a name for ${name}? Tap Add name to save it.`,
  aliasSaved: (alias, name) => `Saved. Now ${alias} means ${name}.`,
  aliasRefused: (reason, alias, name) => strings.alias.refused[reason](alias, name).replace(/"/g, ""),
};

// Prompts never END with a yes or cancel word, so a scrap of our own voice caught by the mic can't
// read as an answer (see the test).
const HI: SpeechTexts = {
  rupees: rupeesHi,
  questions: {
    amount: "कितने पैसे भेजने हैं?",
    payee: "किसे भेजने हैं?",
    exactAmount: "ठीक कितने भेजने हैं? पूरी रकम बोलिए, जैसे तीन सौ।",
    unclear: "माफ़ कीजिए, समझ नहीं आया। किसे और कितने भेजने हैं?",
  },
  confirm: (amount, name) => `${name} को ${amount} भेजें?`,
  rules: {
    NO_PAYEE: "यह व्यक्ति आपके सेव किए हुए लोगों में नहीं है।",
    ZERO: "रकम शून्य से ज़्यादा होनी चाहिए।",
    INVALID_AMOUNT: "यह रकम सही नहीं है।",
    OVER_PER_PAYMENT: "एक बार में ज़्यादा से ज़्यादा 3000 रुपये भेज सकते हैं।",
    NEW_PAYEE_LIMIT: "यह नया व्यक्ति है, इसलिए अभी ज़्यादा से ज़्यादा 500 रुपये भेज सकते हैं।",
    HISTORY_UNREADABLE: "पेमेंट हिस्ट्री पढ़ी नहीं जा सकी, इसलिए पेमेंट रुके हुए हैं।",
    OVER_DAILY: "इससे आज के 5000 रुपये पार हो जाएंगे।",
  },
  dailyRemaining: (amount) => `आज आप ${amount} और भेज सकते हैं।`,
  noPrevious: (name) => `${name} को पहले कोई पेमेंट नहीं मिला। कितने भेजने हैं?`,
  cancelled: "रद्द कर दिया।",
  paused: "ठीक है, जब तैयार हों तो माइक दबाइए।",
  reask: (amount) => `पहले से ही ${amount} है। भेजने के लिए हाँ बोलिए।`,
  tapOnly: "भेजने के लिए हाँ वाला बटन दबाइए।",
  askAgain: "पक्का? फिर से हाँ बोलिए।",
  offer: (amount) => `इसकी जगह ${amount} भेजें?`,
  warnings: {
    FIRST_PAYMENT: (name) => `${name} को यह आपका पहला पेमेंट है।`,
    UNUSUAL_AMOUNT: (name) => `यह ${name} को आम तौर पर भेजी जाने वाली रकम से बहुत ज़्यादा है।`,
    LATE_NIGHT: () => "अभी बहुत रात हो गई है।",
  },
  when: whenHi,
  reminderAsk: (when, name, amount) => `${when} ${name} को ${amount ?? "पैसे"} भेजने की याद दिलाऊँ?`,
  reminderSaved: "रिमाइंडर सेव हो गया।",
  blocked: "मैं सिर्फ़ सेव किए हुए लोगों को पैसे भेज सकता हूँ। नए लोग सेटिंग्स में जोड़िए।",
  spending: (amount, count) => (count === 0 ? "कोई पेमेंट नहीं मिला।" : `${count} पेमेंट में ${amount} भेजे गए।`),
  nudge: "मैं सुन रहा हूँ। बोलिए, किसे और कितने भेजने हैं?",
  failed: "समझ नहीं आया, कृपया फिर से बोलिए।",
  paid: (amount, name) => `हो गया। ${name} को ${amount} भेज दिए।`,
  notPaid: "पेमेंट नहीं हुआ।",
  noUpiApp: "PhonePe नहीं खुला, इसलिए कोई पैसा नहीं गया।",
  didItGo: "क्या पेमेंट हो गया? कृपया नीचे बटन दबाइए।",
  rehearsalNote: "यह सिर्फ़ रिहर्सल था, कोई पैसा नहीं गया।",
  dontKnow: (name) => `मैं ${name} को अभी नहीं जानता। उन्हें सेटिंग्स में जोड़िए।`,
  noUpiFor: (name) => `${name} का UPI ID सेव नहीं है।`,
  helperAsk: (name) => `क्या ${name} को कॉल करूँ?`,
  helperCalling: (name) => `${name} को कॉल करने के लिए फ़ोन खोल रहा हूँ।`,
  tell: (message, name = "") =>
    ({
      cant_change_limits: "मैं लिमिट नहीं बदल सकता। ये आपके पैसे सुरक्षित रखती हैं।",
      cant_skip_confirmation: "मैं भेजने से पहले हमेशा पूछता हूँ, ताकि आप देख सकें।",
      only_saved_payees: "मैं सिर्फ़ सेव किए हुए लोगों को पैसे भेज सकता हूँ। नए लोग सेटिंग्स में जोड़िए।",
      payee_saved: `${name} सेव हैं।`,
      payee_not_saved: `${name} अभी सेव नहीं हैं। उन्हें सेटिंग्स में जोड़िए।`,
      not_supported: "माफ़ कीजिए, यह मैं नहीं कर सकता।",
    })[message],
  recent: (count) => (count === 0 ? "अभी कोई पेमेंट नहीं है।" : `ये आपके पिछले ${count} पेमेंट हैं।`),
  amountFor: (name) => `${name} को कितने भेजने हैं?`,
  notClearAsk: "माफ़ कीजिए, समझ नहीं आया। भेजने के लिए हाँ बोलिए, रोकने के लिए नहीं बोलिए।",
  fullAmountAsk: "पूरी रकम बोलिए, जैसे तीन सौ कर दो। मैं सुन रहा हूँ।",
  explain: {
    nothing: "हाल में कुछ नहीं रुका।",
    perPayment: (amount, name, max) => `${name} को ${amount} रोक दिए गए: एक बार में ज़्यादा से ज़्यादा ${max} भेज सकते हैं।`,
    daily: (amount, name, sent, left) => `${name} को ${amount} रोक दिए गए: आज ${sent} पहले ही भेजे जा चुके हैं, और आज की लिमिट में सिर्फ़ ${left} बचे हैं।`,
    newPayee: (amount, name, hours, max) =>
      `${name} को ${amount} रोक दिए गए: ${name} हाल ही में जोड़े गए हैं, इसलिए अगले ${hours} घंटे एक बार में ज़्यादा से ज़्यादा ${max}।`,
    notSaved: (name) => `${name} आपके सेव किए हुए लोगों में नहीं हैं।`,
    payeeChanged: (name) => `कार्ड दिखाने के बाद ${name} का UPI ID बदल गया, इसलिए कुछ नहीं भेजा गया।`,
    historyUnreadable: "पेमेंट हिस्ट्री पढ़ी नहीं जा सकी, इसलिए पेमेंट रुके हुए हैं।",
    invalidAmount: "यह रकम सही नहीं थी।",
    relative: "रकम किसी और रकम के हिसाब से बोली गई थी। मैं सिर्फ़ पूरी रकम भेजता हूँ, इसलिए पूरी रकम बोलिए।",
    screened: "आपकी बात में UPI ID या फ़ोन नंबर था। मैं वो कभी नहीं भेजता, और सिर्फ़ सेव किए हुए लोगों को पैसे भेजता हूँ।",
    failed: "सर्वर से बात नहीं हो पाई, इसलिए कुछ नहीं भेजा गया। फिर से कोशिश कीजिए।",
    paid: (amount, name) => `पिछला पेमेंट हो गया: ${name} को ${amount}।`,
    notPaid: (amount, name) => `PhonePe ने बताया कि ${name} को ${amount} का पेमेंट नहीं हुआ।`,
    noUpiApp: "PhonePe नहीं खुला, इसलिए कोई पैसा नहीं गया।",
    unsure: (amount, name) => `PhonePe ने नहीं बताया कि ${name} को ${amount} गए या नहीं। PhonePe में देख लीजिए।`,
    saidAs: (spoken, name) => `आपने ${spoken} कहा, जो ${name} के नाम से सेव है।`,
  },
  prefChanged: (key, value) =>
    ({
      "reply_language:hindi": "ठीक है, अब मैं हिंदी में बोलूँगा।",
      "reply_language:english": "ठीक है, अब मैं अंग्रेज़ी में बोलूँगा।",
      "reply_language:auto": "ठीक है, अब मैं माइक की भाषा में बोलूँगा।",
      "speak_replies:off": "ठीक है, अब मैं सिर्फ़ लिख कर दिखाऊँगा।",
      "speak_replies:on": "ठीक है, अब मैं फिर से बोलूँगा।",
      "mic_language:hindi": "ठीक है, अब हिंदी में बोलिए।",
      "mic_language:english": "ठीक है, अब अंग्रेज़ी में बोलिए।",
    } as Record<string, string>)[`${key}:${value}`] ?? "ठीक है।",
  aliasAsk: (alias, name) => `क्या ${alias} को ${name} का नाम जोड़ दूँ? सेव करने के लिए बटन दबाइए।`,
  aliasSaved: (alias, name) => `सेव हो गया। अब ${alias} मतलब ${name}।`,
  aliasRefused: (reason, alias, name) =>
    reason === "noPayee"
      ? `${name} आपके सेव किए हुए लोगों में नहीं हैं।`
      : reason === "already"
        ? `${alias} पहले से ${name} का नाम है।`
        : reason === "usedByOther"
          ? `${alias} किसी और से मिलता है, इसलिए यह नाम नहीं जोड़ा जा सकता।`
          : "यह नाम यहाँ से नहीं जोड़ा जा सकता। सेटिंग्स में जोड़िए।",
};

export const speechTexts = (lang: SpeechLang): SpeechTexts => (lang === "hi-IN" ? HI : EN);
