// ── Banned-content filter ─────────────────────────────────────────────────
//
// This is the *client* half of a two-layer check. The authoritative version
// runs in the database (public.find_banned_content, enforced by the
// enforce_note_insert trigger in
// supabase/migrations/20261103090000_security_hardening.sql). Keep the two in
// sync — the rules here mirror the SQL functions exactly:
//
//   1. leet substitution  ("sh1t", "b4stard", "@ss")
//   2. whole-word matching on punctuation-normalised text
//   3. a vowel-collapsed pass so "f*ck", "f.u.c.k" and "fck" all collapse onto
//      the same shape as "fuck" (only for words long enough not to collide
//      with innocent words)
//   4. a letter-run pass so "f u c k" and "k i l l y o u r s e l f" collapse
//      back into whole words
//
//   5. folding (NFKC, invisible characters, Cyrillic/Greek homoglyphs) so
//      "ｆｕｃｋ" and "fuсk" are the same string, and
//   6. inflected forms ("fucking", "shitty", "retarded", "bitches").
//
// What it still cannot catch (documented in the migration too): novel spellings
// and obfuscations that share no letters with the banned word. A real
// classifier belongs in an Edge Function once volume justifies it.

/**
 * Stems that are also matched with the suffixes below. Keep this list, the
 * suffix list and the SQL copy in
 * supabase/migrations/20261103101500_claim_cap_and_filter_fold.sql in sync.
 */
const BANNED_STEMS = [
  "fuck",
  "shit",
  "bitch",
  "bastard",
  "dick",
  "cunt",
  "nigger",
  "nigga",
  "faggot",
  "retard",
  "bullshit",
  "horseshit",
  "dipshit",
  "asshole",
  "dumbass",
  "jackass",
  "asshat",
  "motherfuck",
  "retardation",
] as const;

/**
 * Short words that must stay whole: "ass" with suffixes would swallow "assess",
 * and "damn" + "ing" is ordinary English ("damning with faint praise").
 */
const BANNED_EXACT = ["ass", "damn"] as const;

const SUFFIXES = [
  "",
  "s",
  "es",
  "ed",
  "d",
  "er",
  "ers",
  "ing",
  "ings",
  "y",
  "ies",
  "ty",
] as const;

const BANNED_PHRASES = ["kill yourself", "kys"] as const;

/** Zero-width, directional marks, word joiner, BOM, soft hyphen, MVS. */
const INVISIBLE = /[\u200B-\u200F\u2060\uFEFF\u00AD\u180E]/g;

/**
 * Letters that render identically to Latin ones. NFKC handles fullwidth text;
 * this handles Cyrillic and Greek, which it does not fold.
 */
const CONFUSABLES: Record<string, string> = {
  "\u0430": "a", // Cyrillic а
  "\u0435": "e", // е
  "\u043E": "o", // о
  "\u0440": "p", // р
  "\u0441": "c", // с
  "\u0443": "y", // у
  "\u0445": "x", // х
  "\u0456": "i", // і
  "\u03BF": "o", // Greek ο
  "\u03B1": "a", // α
  "\u03B5": "e", // ε
  "\u03B9": "i", // ι
};

/** NFKC, invisible characters deleted, confusables mapped, lowercased. */
export function foldForFilter(text: string): string {
  return Array.from(text.normalize("NFKC").replace(INVISIBLE, ""))
    .map((char) => CONFUSABLES[char] ?? char)
    .join("")
    .toLowerCase();
}

const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

function unleet(text: string): string {
  return text.toLowerCase().replace(/[013457@$]/g, (char) => LEET_MAP[char] ?? char);
}

/** Lowercase, leet-normalised, punctuation → single space, trimmed. */
export function normalizeForFilter(text: string): string {
  return unleet(foldForFilter(text))
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same as normalise, but punctuation is deleted instead of spaced ("f*ck" → "fck"). */
export function condenseForFilter(text: string): string {
  return unleet(foldForFilter(text))
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Joins runs of single-letter tokens: "f u c k this" → "fuck this".
 *
 * Token-based rather than regex-based so it can never merge into the middle of
 * a normal word — "i a m proud" becomes "iam proud", which matches nothing.
 */
export function collapseLetterRuns(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  const output: string[] = [];
  let buffer = "";

  for (const word of words) {
    if (/^[a-z]$/.test(word)) {
      buffer += word;
      continue;
    }
    if (buffer) {
      output.push(buffer);
      buffer = "";
    }
    output.push(word);
  }

  if (buffer) output.push(buffer);
  return output.join(" ");
}

/** Vowels removed, whitespace collapsed. */
export function stripVowels(text: string): string {
  return text
    .replace(/[aeiou]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface PhraseRule {
  phrase: string;
  direct: RegExp;
  /** matches the phrase once letter runs are joined: "killyourself" */
  lettersJoined: RegExp;
  vowelCollapsed: RegExp;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Every banned surface form, mapped back to the canonical word we report.
 * Built once at module load rather than on every keystroke.
 */
const FORM_TO_WORD = new Map<string, string>();
/** Vowel-collapsed surface form ("fckng") → canonical word, for "f*cking". */
const COLLAPSED_TO_WORD = new Map<string, string>();

for (const word of BANNED_EXACT) {
  FORM_TO_WORD.set(word, word);
}

for (const stem of BANNED_STEMS) {
  for (const suffix of SUFFIXES) {
    const form = `${stem}${suffix}`;
    if (!FORM_TO_WORD.has(form)) FORM_TO_WORD.set(form, stem);

    const collapsed = stripVowels(form);
    // Very short collapsed forms ("sht") collide with innocent text, and the
    // direct pass already covers the plain spelling.
    if (collapsed.length >= 3 && !COLLAPSED_TO_WORD.has(collapsed)) {
      COLLAPSED_TO_WORD.set(collapsed, stem);
    }
  }
}

function alternation(forms: Iterable<string>): string {
  return [...forms]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join("|");
}

const FORM_PATTERN = new RegExp(`\\b(?:${alternation(FORM_TO_WORD.keys())})\\b`);
const COLLAPSED_PATTERN = new RegExp(`\\b(?:${alternation(COLLAPSED_TO_WORD.keys())})\\b`);

const PHRASE_RULES: PhraseRule[] = BANNED_PHRASES.map((phrase) => ({
  phrase,
  direct: new RegExp(`\\b${phrase.split(/\s+/).map(escapeRegex).join("\\s+")}\\b`),
  lettersJoined: new RegExp(`\\b${escapeRegex(phrase.replace(/\s+/g, ""))}\\b`),
  vowelCollapsed: new RegExp(
    `\\b${escapeRegex(stripVowels(phrase.replace(/\s+/g, "")))}\\b`,
  ),
}));

export interface BannedResult {
  hit: boolean;
  match: string | null;
  type: "word" | "phrase" | null;
}

/**
 * Returns the first banned word or phrase found in `text`.
 * `match` is the canonical spelling from the list, not the evasive input.
 */
export function findBannedContent(text: string): BannedResult {
  if (!text) return { hit: false, match: null, type: null };

  const folded = foldForFilter(text);
  const normalized = normalizeForFilter(folded);
  const lettersJoined = collapseLetterRuns(normalized);
  const vowelCollapsed = stripVowels(condenseForFilter(folded));

  // Phrases first: they may contain words that are also in the word list.
  for (const rule of PHRASE_RULES) {
    if (
      rule.direct.test(normalized) ||
      rule.lettersJoined.test(lettersJoined) ||
      rule.vowelCollapsed.test(vowelCollapsed)
    ) {
      return { hit: true, match: rule.phrase, type: "phrase" };
    }
  }

  const direct = FORM_PATTERN.exec(normalized) ?? FORM_PATTERN.exec(lettersJoined);
  if (direct) {
    const word = FORM_TO_WORD.get(direct[0]);
    if (word) return { hit: true, match: word, type: "word" };
  }

  const collapsed = COLLAPSED_PATTERN.exec(vowelCollapsed);
  if (collapsed) {
    const word = COLLAPSED_TO_WORD.get(collapsed[0]);
    if (word) return { hit: true, match: word, type: "word" };
  }

  return { hit: false, match: null, type: null };
}
