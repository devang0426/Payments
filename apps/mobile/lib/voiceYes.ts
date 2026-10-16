// Strict voice confirmation. Pure. Only a whole, unambiguous "yes" counts; everything else
// (including "yes but", "haan nahi", "no", silence) does nothing, and the user taps instead.
const ACCEPTED = new Set([
  "yes",
  "yes send",
  "yes send it",
  "yes please",
  "haan",
  "haan ji",
  "haan bhejo",
  "haan bhej do",
  "haanji",
  "हाँ",
  "हां",
  "हाँ जी",
  "हां जी",
  "हाँ भेजो",
  "हां भेजो",
  "हाँ भेज दो",
  "हां भेज दो",
]);

export function isVoiceYes(transcript: string): boolean {
  const normalized = transcript
    .normalize("NFC")
    .toLowerCase()
    .replace(/[.,!?।"'“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ACCEPTED.has(normalized);
}
