// Spoken amount (Hinglish / Hindi in Latin or Devanagari script / digits) → integer paise.
// The AI only extracts the amount text; this code decides the number. No floats:
// every quantity is kept in paise (hundredths of a rupee), so 1.5 = 150, 2.5 = 250.

export type ParseAmountResult = { ok: true; paise: number } | { ok: false; reason: string };

const fail = (reason: string): ParseAmountResult => ({ ok: false, reason });

// Devanagari spelling variants are folded before any lookup: chandrabindu ँ = anusvara ं (पाँच = पांच)
// and the nukta ़ is dropped (हज़ार = हजार, डेढ़ = डेढ). Latin text passes through unchanged.
function fold(word: string): string {
  return word.normalize("NFD").replace(/़/g, "").replace(/ँ/g, "ं").normalize("NFC");
}

// 1–99 in rupees, with common Latin and Devanagari spellings.
const NUMBER_WORDS: Record<string, number> = {};
function words(value: number, ...spellings: string[]) {
  for (const s of spellings) NUMBER_WORDS[fold(s)] = value;
}
words(1, "ek");
words(2, "do");
words(3, "teen", "tin");
words(4, "chaar", "char");
words(5, "paanch", "panch", "paach", "pach");
words(6, "chhe", "chhah", "che", "chah", "chheh");
words(7, "saat", "sat");
words(8, "aath", "ath");
words(9, "nau");
words(10, "das", "dus");
words(11, "gyarah", "gyaarah", "gyara", "gyaraa");
words(12, "barah", "baarah", "bara", "baara");
words(13, "terah", "tera");
words(14, "chaudah", "chauda", "chaudaa");
words(15, "pandrah", "pandra");
words(16, "solah", "sola");
words(17, "satrah", "satra");
words(18, "atharah", "athara", "attharah");
words(19, "unnees", "unnis");
words(20, "bees", "bis");
words(21, "ikkees", "ikkis");
words(22, "baees", "bais", "baais");
words(23, "teis", "teyees");
words(24, "chaubees", "chaubis");
words(25, "pachees", "pachchees", "pachis", "pachchis");
words(26, "chhabbees", "chhabbis");
words(27, "sattaees", "sattais");
words(28, "atthaees", "atthais");
words(29, "untees", "untis");
words(30, "tees", "tis");
words(31, "ikattees", "iktees", "iktis");
words(32, "battees", "battis");
words(33, "taintees", "taintis", "tetis");
words(34, "chauntees", "chautees", "chautis");
words(35, "paintees", "paintis");
words(36, "chhattees", "chhattis");
words(37, "saintees", "saintis");
words(38, "adtees", "artees", "artis");
words(39, "untaalees", "untalees", "untalis");
words(40, "chaalees", "chalees", "chalis", "chaalis");
words(41, "iktaalees", "iktalis");
words(42, "bayaalees", "bayalis");
words(43, "taintaalees", "tentalis");
words(44, "chauvaalees", "chavalis", "chauwalis");
words(45, "paintaalees", "paintalis");
words(46, "chhiyaalees", "chhiyalis");
words(47, "saintaalees", "saintalis");
words(48, "adtaalees", "artalis");
words(49, "unchaas", "unchas");
words(50, "pachaas", "pachas");
words(51, "ikyaavan", "ikyavan");
words(52, "baavan", "bavan");
words(53, "tirepan", "tirpan");
words(54, "chauvan", "chauwan");
words(55, "pachpan");
words(56, "chhappan");
words(57, "sattaavan", "sattavan");
words(58, "atthaavan", "atthavan");
words(59, "unsath");
words(60, "saath");
words(61, "iksath");
words(62, "baasath", "basath");
words(63, "tirsath");
words(64, "chausath", "chaunsath");
words(65, "painsath");
words(66, "chhiyaasath", "chhiyasath");
words(67, "sadsath", "sarsath");
words(68, "adsath", "arsath");
words(69, "unhattar");
words(70, "sattar");
words(71, "ikhattar");
words(72, "bahattar");
words(73, "tihattar");
words(74, "chauhattar");
words(75, "pachattar", "pachhattar");
words(76, "chhihattar");
words(77, "sathattar", "satattar");
words(78, "athattar");
words(79, "unaasi", "unasi");
words(80, "assi");
words(81, "ikyaasi", "ikyasi");
words(82, "bayaasi", "bayasi");
words(83, "tiraasi", "tirasi");
words(84, "chauraasi", "chaurasi");
words(85, "pachaasi", "pachasi");
words(86, "chhiyaasi", "chhiyasi");
words(87, "sattaasi", "sattasi");
words(88, "atthaasi", "atthasi");
words(89, "navaasi", "nawasi");
words(90, "nabbe");
words(91, "ikyaanve", "ikyanve");
words(92, "baanve", "banve");
words(93, "tiraanve", "tiranve");
words(94, "chauraanve", "chauranve");
words(95, "pachaanve", "pachanve");
words(96, "chhiyaanve", "chhiyanve");
words(97, "sattaanve", "sattanve");
words(98, "atthaanve", "atthanve");
words(99, "ninyaanve", "ninyanve", "ninyanbe");

// Devanagari (the हिं mic writes these). Spelling variants are folded, see fold().
words(1, "एक");
words(2, "दो");
words(3, "तीन");
words(4, "चार");
words(5, "पांच");
words(6, "छह", "छः", "छै", "छे");
words(7, "सात");
words(8, "आठ");
words(9, "नौ");
words(10, "दस");
words(11, "ग्यारह");
words(12, "बारह");
words(13, "तेरह");
words(14, "चौदह");
words(15, "पंद्रह", "पन्द्रह");
words(16, "सोलह");
words(17, "सत्रह");
words(18, "अठारह", "अट्ठारह");
words(19, "उन्नीस");
words(20, "बीस");
words(21, "इक्कीस");
words(22, "बाईस");
words(23, "तेईस");
words(24, "चौबीस");
words(25, "पच्चीस");
words(26, "छब्बीस");
words(27, "सत्ताईस");
words(28, "अट्ठाईस");
words(29, "उनतीस");
words(30, "तीस");
words(31, "इकतीस", "इकत्तीस");
words(32, "बत्तीस");
words(33, "तैंतीस");
words(34, "चौंतीस");
words(35, "पैंतीस");
words(36, "छत्तीस");
words(37, "सैंतीस");
words(38, "अड़तीस");
words(39, "उनतालीस");
words(40, "चालीस");
words(41, "इकतालीस");
words(42, "बयालीस");
words(43, "तैंतालीस");
words(44, "चवालीस", "चौवालीस");
words(45, "पैंतालीस");
words(46, "छियालीस");
words(47, "सैंतालीस");
words(48, "अड़तालीस");
words(49, "उनचास");
words(50, "पचास");
words(51, "इक्यावन");
words(52, "बावन");
words(53, "तिरपन");
words(54, "चौवन");
words(55, "पचपन");
words(56, "छप्पन");
words(57, "सत्तावन");
words(58, "अट्ठावन");
words(59, "उनसठ");
words(60, "साठ");
words(61, "इकसठ");
words(62, "बासठ");
words(63, "तिरसठ");
words(64, "चौंसठ");
words(65, "पैंसठ");
words(66, "छियासठ");
words(67, "सड़सठ");
words(68, "अड़सठ");
words(69, "उनहत्तर");
words(70, "सत्तर");
words(71, "इकहत्तर");
words(72, "बहत्तर");
words(73, "तिहत्तर");
words(74, "चौहत्तर");
words(75, "पचहत्तर");
words(76, "छिहत्तर");
words(77, "सतहत्तर");
words(78, "अठहत्तर");
words(79, "उन्यासी", "उनासी");
words(80, "अस्सी");
words(81, "इक्यासी");
words(82, "बयासी");
words(83, "तिरासी");
words(84, "चौरासी");
words(85, "पचासी");
words(86, "छियासी");
words(87, "सत्तासी");
words(88, "अट्ठासी");
words(89, "नवासी");
words(90, "नब्बे");
words(91, "इक्यानवे");
words(92, "बानवे");
words(93, "तिरानवे");
words(94, "चौरानवे");
words(95, "पचानवे");
words(96, "छियानवे");
words(97, "सत्तानवे");
words(98, "अट्ठानवे");
words(99, "निन्यानवे");

// Folded keys for the tables below.
const keys = <T>(table: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(table).map(([k, v]) => [fold(k), v]));

// "sau" multiplies inside a group; the big multipliers close a group.
const HUNDRED = new Set(["sau", fold("सौ")]);
const BIG_MULTIPLIERS: Record<string, number> = keys({
  hazaar: 1000,
  hazar: 1000,
  hajar: 1000,
  hajaar: 1000,
  k: 1000,
  lakh: 100000,
  laakh: 100000,
  lac: 100000,
  lakhs: 100000,
  "हज़ार": 1000,
  "लाख": 100000,
});

// Standalone fractions, in paise per rupee unit (1.5 → 150).
const FRACTIONS: Record<string, number> = keys({
  dedh: 150,
  derh: 150,
  dhai: 250,
  dhaai: 250,
  adhai: 250,
  dhayi: 250,
  "डेढ़": 150,
  "ढाई": 250,
  "अढ़ाई": 250,
});

// Prefixes that modify the next number: sawa X = X + ¼, saadhe X = X + ½, paune X = X − ¼.
const PREFIXES: Record<string, { delta: number; alone: number | null }> = keys({
  sawa: { delta: 25, alone: 125 }, // "sawa sau" = 1.25 × 100
  sava: { delta: 25, alone: 125 },
  saadhe: { delta: 50, alone: null }, // "saadhe sau" isn't said
  saade: { delta: 50, alone: null },
  sade: { delta: 50, alone: null },
  saarhe: { delta: 50, alone: null },
  paune: { delta: -25, alone: 75 }, // "paune sau" = 0.75 × 100
  pone: { delta: -25, alone: 75 },
  "सवा": { delta: 25, alone: 125 },
  "साढ़े": { delta: 50, alone: null },
  "पौने": { delta: -25, alone: 75 },
});

const CURRENCY = new Set(
  ["₹", "rs", "rs.", "inr", "rupaye", "rupaya", "rupiya", "rupees", "rupee", "rupay", "rupye", "रुपये", "रुपए", "रुपया", "रुपय", "रु", "रु."].map(fold),
);

// A trailing "do" / "दो" after an amount is the verb "give" ("paanch sau do", "पाँच सौ दो").
const GIVE = new Set(["do", fold("दो")]);

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

// "500", "1,500", "1,50,000", "250.50", "500.5" → paise. null if not a plain number.
function parseDigits(token: string): number | null {
  const m = /^(\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3}|\d+)(?:\.(\d{1,2}))?$/.exec(token);
  if (!m) return null;
  const whole = m[1]!.replace(/,/g, "").replace(/^0+(?=\d)/, "");
  if (whole.length > 12) return null;
  const fraction = (m[2] ?? "").padEnd(2, "0");
  return Number(whole) * 100 + Number(fraction);
}

function tokenize(text: string): string[] {
  let s = text.normalize("NFC").trim().toLowerCase();
  s = s.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
  s = s.replace(/(₹|\brs\.?)(?=\d)/g, "$1 "); // "₹500", "rs.500" → separate tokens
  s = s.replace(/(\d)(₹|rs\b)/g, "$1 $2"); // "500rs"
  s = s.replace(/(\d)k\b/g, "$1 k"); // "1.5k" → "1.5 k"
  return s.split(/\s+/).filter(Boolean).map(fold);
}

type Token =
  | { kind: "number"; paise: number; whole: boolean }
  | { kind: "hundred" }
  | { kind: "big"; factor: number }
  | { kind: "prefix"; delta: number; alone: number | null };

function classify(token: string): Token | null {
  const digits = parseDigits(token);
  if (digits !== null) return { kind: "number", paise: digits, whole: digits % 100 === 0 };
  const word = NUMBER_WORDS[token];
  if (word !== undefined) return { kind: "number", paise: word * 100, whole: true };
  const fraction = FRACTIONS[token];
  if (fraction !== undefined) return { kind: "number", paise: fraction, whole: false };
  if (HUNDRED.has(token)) return { kind: "hundred" };
  const big = BIG_MULTIPLIERS[token];
  if (big !== undefined) return { kind: "big", factor: big };
  const prefix = PREFIXES[token];
  if (prefix !== undefined) return { kind: "prefix", ...prefix };
  return null;
}

export function parseAmount(text: string): ParseAmountResult {
  if (/[-−+]/.test(text)) return fail("Negative or signed amounts are not allowed");

  let rawTokens = tokenize(text).filter((t) => !CURRENCY.has(t));
  if (rawTokens.length === 0) return fail("No amount found");

  // A trailing "do" / "दो" after an amount is the verb "give" ("paanch sau do").
  if (rawTokens.length > 1 && GIVE.has(rawTokens[rawTokens.length - 1]!)) {
    rawTokens = rawTokens.slice(0, -1);
  }

  const tokens: Token[] = [];
  for (const raw of rawTokens) {
    const t = classify(raw);
    if (!t) return fail(`Not an amount word: "${raw}"`);
    tokens.push(t);
  }

  // Resolve prefixes (sawa / saadhe / paune) into plain numbers.
  const resolved: Exclude<Token, { kind: "prefix" }>[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.kind !== "prefix") {
      resolved.push(t);
      continue;
    }
    const next = tokens[i + 1];
    if (next?.kind === "number" && next.whole && next.paise >= 100) {
      resolved.push({ kind: "number", paise: next.paise + t.delta, whole: false });
      i++;
    } else if ((next?.kind === "hundred" || next?.kind === "big") && t.alone !== null) {
      resolved.push({ kind: "number", paise: t.alone, whole: false });
    } else {
      return fail("Incomplete fraction (sawa / saadhe / paune)");
    }
  }

  // Indian grouping: [n] lakh [n] hazaar [n sau] [n]. Groups must get smaller.
  let total = 0;
  let current: number | null = null; // paise in the open group
  let state: "none" | "number" | "hundred" | "hundredNumber" = "none";
  let lastBig = Infinity;

  for (const t of resolved) {
    if (t.kind === "number") {
      if (state === "none") {
        current = t.paise;
        state = "number";
      } else if (state === "hundred" && t.whole && t.paise < 10000) {
        current = current! + t.paise; // "ek sau pachees"
        state = "hundredNumber";
      } else {
        return fail("More than one amount");
      }
    } else if (t.kind === "hundred") {
      if (state === "none") current = 100 * 100;
      else if (state === "number") current = current! * 100;
      else return fail("Repeated multiplier");
      state = "hundred";
    } else {
      if (state !== "none" && state !== "number") return fail("Unusual number order");
      if (t.factor >= lastBig) return fail("Multipliers out of order");
      const group = (state === "none" ? 100 : current!) * t.factor;
      if (Number.isFinite(lastBig) && group >= lastBig * 100) return fail("Group too large");
      total += group;
      lastBig = t.factor;
      current = null;
      state = "none";
    }
  }

  if (current !== null) {
    if (Number.isFinite(lastBig) && current >= lastBig * 100) return fail("Group too large");
    total += current;
  }

  if (!Number.isSafeInteger(total)) return fail("Amount too large");
  if (total <= 0) return fail("Amount must be more than zero");
  return { ok: true, paise: total };
}
