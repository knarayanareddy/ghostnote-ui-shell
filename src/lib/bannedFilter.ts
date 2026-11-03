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
//
// Known limitation (documented in the migration too): fully letter-spaced
// text such as "f u c k" is not detected. A real classifier belongs in an
// Edge Function once volume justifies it.

const BANNED_WORDS = [
  "fuck",
  "shit",
  "damn",
  "bitch",
  "ass",
  "bastard",
  "dick",
  "cunt",
  "nigger",
  "nigga",
  "faggot",
  "retard",
] as const;

const BANNED_PHRASES = ["kill yourself", "kys"] as const;

/** Minimum length before the vowel-collapsed comparison is applied. */
const VOWEL_CHECK_MIN_LENGTH = 4;

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
  return unleet(text)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same as normalise, but punctuation is deleted instead of spaced ("f*ck" → "fck"). */
export function condenseForFilter(text: string): string {
  return unleet(text)
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Vowels removed, whitespace collapsed. */
export function stripVowels(text: string): string {
  return text
    .replace(/[aeiou]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface WordRule {
  word: string;
  direct: RegExp;
  vowelCollapsed: RegExp | null;
}

interface PhraseRule {
  phrase: string;
  direct: RegExp;
  vowelCollapsed: RegExp;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Compiled once at module load rather than on every keystroke.
const WORD_RULES: WordRule[] = BANNED_WORDS.map((word) => ({
  word,
  direct: new RegExp(`\\b${escapeRegex(word)}\\b`),
  vowelCollapsed:
    word.length >= VOWEL_CHECK_MIN_LENGTH
      ? new RegExp(`\\b${escapeRegex(stripVowels(word))}\\b`)
      : null,
}));

const PHRASE_RULES: PhraseRule[] = BANNED_PHRASES.map((phrase) => ({
  phrase,
  direct: new RegExp(`\\b${phrase.split(/\s+/).map(escapeRegex).join("\\s+")}\\b`),
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

  const normalized = normalizeForFilter(text);
  const vowelCollapsed = stripVowels(condenseForFilter(text));

  // Phrases first: they may contain words that are also in the word list.
  for (const rule of PHRASE_RULES) {
    if (rule.direct.test(normalized) || rule.vowelCollapsed.test(vowelCollapsed)) {
      return { hit: true, match: rule.phrase, type: "phrase" };
    }
  }

  for (const rule of WORD_RULES) {
    if (rule.direct.test(normalized)) {
      return { hit: true, match: rule.word, type: "word" };
    }
    if (rule.vowelCollapsed?.test(vowelCollapsed)) {
      return { hit: true, match: rule.word, type: "word" };
    }
  }

  return { hit: false, match: null, type: null };
}
