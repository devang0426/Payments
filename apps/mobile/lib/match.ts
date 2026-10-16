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

// A payee matches when the spoken name equals its name or an alias, or equals their first
// word(s) ("Rahul" → "Rahul Verma"). More than one match is always "many" (the user picks).
export function matchPayees(spokenName: string, payees: Payee[]): MatchResult {
  const spoken = normalizeName(spokenName);
  if (!spoken) return { kind: "none" };

  const matches = payees.filter((payee) =>
    [payee.displayName, ...payee.aliases].some((form) => {
      const candidate = normalizeName(form);
      return candidate === spoken || candidate.startsWith(`${spoken} `);
    }),
  );

  if (matches.length === 0) return { kind: "none" };
  if (matches.length === 1) return { kind: "one", payee: matches[0]! };
  return { kind: "many", payees: matches };
}
