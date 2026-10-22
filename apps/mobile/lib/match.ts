// Spoken name → saved payee. Pure: no React/Expo imports.
import type { Payee } from "./payees";

// Spellings of the same relationship → one canonical word.
const RELATIONSHIPS: Record<string, string> = {
  mummy: "mummy",
  mumma: "mummy",
  mumy: "mummy",
  mommy: "mummy",
  mom: "mummy",
  maa: "mummy",
  ma: "mummy",
  "मम्मी": "mummy",
  "माँ": "mummy",
  "मां": "mummy",
  papa: "papa",
  pappa: "papa",
  dad: "papa",
  daddy: "papa",
  "पापा": "papa",
  // M11: more relatives, so the हिं mic finds payees saved in Latin script
  bhaiyya: "bhaiya",
  bhaiyaa: "bhaiya",
  "भैया": "bhaiya",
  "दीदी": "didi",
  "नानी": "nani",
  "नाना": "nana",
  "दादी": "dadi",
  "दादा": "dada",
  "चाचा": "chacha",
  "चाची": "chachi",
  "भाभी": "bhabhi",
  "मामा": "mama", // Devanagari only: the Latin "mama" can mean mom in English, so it isn't mapped
  "मामी": "mami",
  "मौसी": "mausi",
  mosi: "mausi",
  "मौसा": "mausa",
  mosa: "mausa",
  "बुआ": "bua",
  "फूफा": "phupha",
  fufa: "phupha",
};

// Dropped from the end of a name, but never if it is the whole name ("Bhaiya").
const HONORIFICS = new Set(["ji", "jee", "bhaiya", "bhaiyya", "bhai", "didi", "जी", "भैया", "दीदी"]);

export function normalizeName(name: string): string {
  const tokens = name
    .normalize("NFC")
    .toLowerCase()
    .replace(/[.,!?'"()]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (tokens.length > 1 && HONORIFICS.has(tokens[tokens.length - 1]!)) tokens.pop();
  return tokens.map((t) => RELATIONSHIPS[t] ?? t).join(" ");
}

export type MatchResult =
  | { kind: "one"; payee: Payee }
  | { kind: "many"; payees: Payee[] }
  | { kind: "none" };

// --- Cross-script matching (M11) -------------------------------------------------------------------
// The हिं mic writes names in Devanagari ("राहुल"); payees are often saved in Latin ("Rahul"), and the
// other way round. Both are turned into a loose Latin key that ignores what the two spellings disagree
// on: long vs short vowels, w/v, the inherent "a" between consonants and at the end of a word. It is
// deliberately loose, so it never decides alone: see matchPayees.

const DEVANAGARI = /[ऀ-ॿ]/;

const VOWELS: Record<string, string> = {
  "अ": "a", "आ": "aa", "इ": "i", "ई": "ii", "उ": "u", "ऊ": "uu", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऋ": "ri",
};
const MATRAS: Record<string, string> = {
  "ा": "aa", "ि": "i", "ी": "ii", "ु": "u", "ू": "uu", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ृ": "ri",
};
const CONSONANTS: Record<string, string> = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh",
  "ष": "sh", "स": "s", "ह": "h",
};
const VIRAMA = "्";

// Devanagari → plain Latin letters (every consonant keeps its "a" unless a matra or virama follows).
function transliterate(text: string): string {
  const chars = [...text.normalize("NFD").replace(/़/g, "")]; // nukta dropped: ड़ → ड, ज़ → ज
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    const next = chars[i + 1] ?? "";
    if (CONSONANTS[c]) out += CONSONANTS[c] + (MATRAS[next] || next === VIRAMA ? "" : "a");
    else if (MATRAS[c]) out += MATRAS[c];
    else if (VOWELS[c]) out += VOWELS[c];
    else if (c === "ं" || c === "ँ") out += "n";
    else if (c === "ः") out += "h";
    else if (c !== VIRAMA) out += c;
  }
  return out;
}

function looseWord(word: string): string {
  return word
    .replace(/[^a-z]/g, "")
    .replace(/aa/g, "a")
    .replace(/ee|ii/g, "i")
    .replace(/oo|uu/g, "u")
    .replace(/w/g, "v")
    .replace(/ph/g, "f")
    .replace(/z/g, "j")
    .replace(/q/g, "k")
    .replace(/a$/, "") // inherent "a" at the end
    .replace(/([^aeiou])a(?=[^aeiou])/g, "$1") // inherent "a" between consonants
    .replace(/(.)\1+/g, "$1"); // doubled letters
}

// The loose key of a name, after the usual normalization (relatives and honorifics included).
export function crossScriptKey(name: string): string {
  return transliterate(normalizeName(name))
    .toLowerCase()
    .split(/\s+/)
    .map(looseWord)
    .filter(Boolean)
    .join(" ");
}

const sameOrFirstWords = (candidate: string, spoken: string) =>
  candidate === spoken || candidate.startsWith(`${spoken} `);

// A payee matches when the spoken name equals its name or an alias, or equals their first
// word(s) ("Rahul" → "Rahul Verma"). Since M11 a payee also matches when a name or alias in the OTHER
// script has the same loose key ("राहुल" ↔ "Rahul"). Both kinds are combined: an exact match is never
// picked if a cross-script match finds a different payee. More than one match is always "many" (the
// user picks from "Which X?").
export function matchPayees(spokenName: string, payees: Payee[]): MatchResult {
  const spoken = normalizeName(spokenName);
  if (!spoken) return { kind: "none" };
  const spokenIsDevanagari = DEVANAGARI.test(spoken);
  const spokenKey = crossScriptKey(spoken);

  const matches = payees.filter((payee) =>
    [payee.displayName, ...payee.aliases].some((form) => {
      const candidate = normalizeName(form);
      if (!candidate) return false;
      if (sameOrFirstWords(candidate, spoken)) return true;
      // Cross-script: only a form in the other script, compared by loose key.
      return !!spokenKey && DEVANAGARI.test(candidate) !== spokenIsDevanagari && sameOrFirstWords(crossScriptKey(candidate), spokenKey);
    }),
  );

  if (matches.length === 0) return { kind: "none" };
  if (matches.length === 1) return { kind: "one", payee: matches[0]! };
  return { kind: "many", payees: matches };
}
