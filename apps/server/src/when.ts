// Spoken periods and reminder dates → fixed values, by code (M13). Pure. The AI only copies the span;
// these decide what it means. No clock: the phone turns the values into IST dates.
// "kal" depends on the question: in a spending question it is yesterday, in a reminder tomorrow.

export type Period = "today" | "yesterday" | "this_week" | "this_month" | "last_month";

export type When =
  | { kind: "inDays"; days: 1 | 2 }
  | { kind: "dayOfMonth"; day: number } // once, the next date with this day (1–31)
  | { kind: "monthly"; day: number }; // every month (1–28: every month has these)

// NFC, lowercase, punctuation out, nukta dropped (हफ़्ते = हफ्ते), Devanagari digits → 0–9.
function clean(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/़/g, "")
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
    .replace(/[,!?।"'“”…]/g, " ")
    .replace(/\.(?=\s|$)/g, " ") // a full stop, not the "." in "1.5"
    .replace(/\s+/g, " ")
    .trim();
}

const PERIODS: Record<Period, string[]> = {
  today: ["aaj", "aj", "today", "आज"],
  yesterday: ["kal", "yesterday", "कल"],
  this_week: ["is hafte", "iss hafte", "is week", "this week", "इस हफ्ते"],
  this_month: ["is mahine", "iss mahine", "is month", "this month", "इस महीने"],
  last_month: ["pichhle mahine", "pichle mahine", "pichhla mahina", "pichla mahina", "last month", "पिछले महीने", "पिछला महीना"],
};

const PERIOD_OF = new Map<string, Period>(
  (Object.entries(PERIODS) as [Period, string[]][]).flatMap(([p, words]) => words.map((w) => [clean(w), p] as const)),
);

export function parsePeriod(text: string): Period | null {
  const t = clean(text).replace(/ (mein|me|main|में)$/, "");
  return PERIOD_OF.get(t) ?? null;
}

// The one period the user's own message names, by code (whole words, any script), or null when it
// names none or two different ones. Used when the AI copied the period in the wrong script.
export function findPeriodIn(text: string): Period | null {
  const words = clean(text).split(" ");
  const found = new Set<Period>();
  for (const [phrase, period] of PERIOD_OF) {
    const p = phrase.split(" ");
    for (let i = 0; i + p.length <= words.length; i++) {
      if (p.every((w, j) => words[i + j] === w)) found.add(period);
    }
  }
  return found.size === 1 ? [...found][0]! : null;
}

const IN_DAYS: Record<string, 1 | 2> = {
  kal: 1,
  tomorrow: 1,
  कल: 1,
  parson: 2,
  parso: 2,
  "day after tomorrow": 2,
  परसों: 2,
  परसो: 2,
};

// "15", "15th", "pehli" (1st). Anything else is null.
function dayNumber(word: string): number | null {
  if (word === "pehli" || word === "pahli" || word === "पहली") return 1;
  const m = /^(\d{1,2})(st|nd|rd|th)?$/.exec(word);
  return m ? Number(m[1]) : null;
}

const TAREEKH = "(?:tareekh|tarikh|tarik|tareek|तारीख)";
const DAY = "(\\d{1,2}(?:st|nd|rd|th)?|pehli|pahli|पहली)";
// Once: "1 tareekh (ko)", "1st (ko)". A bare "1 ko" is too vague.
const ONCE = new RegExp(`^${DAY}(?: ${TAREEKH}(?: (?:ko|को))?| (?:ko|को))?$`);
// Every month: "har mahine (ki) 1 (tareekh) (ko)", "every month on (the) 1st", "हर महीने (की) 1 …".
const MONTHLY = new RegExp(
  `^(?:har mahine(?: ki)?|every month(?: on)?(?: the)?|हर महीने(?: की)?) ${DAY}(?: ${TAREEKH})?(?: (?:ko|को))?$`,
);

export function parseWhen(text: string): When | null {
  const t = clean(text);
  const days = IN_DAYS[t];
  if (days) return { kind: "inDays", days };

  const monthly = MONTHLY.exec(t);
  if (monthly) {
    const day = dayNumber(monthly[1]!);
    return day !== null && day >= 1 && day <= 28 ? { kind: "monthly", day } : null;
  }

  const once = ONCE.exec(t);
  if (!once) return null;
  const word = once[1]!;
  // Plain digits need a "tareekh" or an ordinal ending: "5" or "1 ko" alone could be anything.
  const hasMarker = /tareekh|tarikh|tarik|tareek|तारीख/.test(t) || /\d(st|nd|rd|th)$/.test(word) || !/^\d/.test(word);
  if (!hasMarker) return null;
  const day = dayNumber(word);
  return day !== null && day >= 1 && day <= 31 ? { kind: "dayOfMonth", day } : null;
}
