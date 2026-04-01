// ── Banned-content filter with whole-word matching ──

const BANNED_WORDS = [
  "fuck", "shit", "damn", "bitch", "ass", "bastard",
  "dick", "cunt", "nigger", "nigga", "faggot", "retard",
];

const BANNED_PHRASES = [
  "kill yourself", "kys",
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Normalize: lowercase, replace punctuation (except apostrophes) with spaces, collapse whitespace */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")   // punctuation → space (keep apostrophes)
    .replace(/\s+/g, " ")
    .trim();
}

export interface BannedResult {
  hit: boolean;
  match: string | null;
  type: "word" | "phrase" | null;
}

export function findBannedContent(text: string): BannedResult {
  const normalized = normalize(text);

  // Check phrases first (they may contain words that are also in the word list)
  for (const phrase of BANNED_PHRASES) {
    // Build regex that allows flexible whitespace/punctuation between words
    const pattern = phrase
      .split(/\s+/)
      .map(escapeRegex)
      .join("[\\s]+");
    if (new RegExp(`\\b${pattern}\\b`, "i").test(normalized)) {
      return { hit: true, match: phrase, type: "phrase" };
    }
  }

  // Check single words with word boundaries
  for (const word of BANNED_WORDS) {
    if (new RegExp(`\\b${escapeRegex(word)}\\b`, "i").test(normalized)) {
      return { hit: true, match: word, type: "word" };
    }
  }

  return { hit: false, match: null, type: null };
}

// ── Sanity checks (run via: console.log(runBannedFilterChecks())) ──
export function runBannedFilterChecks() {
  const tests = [
    { input: "class is great", expectHit: false },
    { input: "pass the ball", expectHit: false },
    { input: "compass reading", expectHit: false },
    { input: "grassy field", expectHit: false },
    { input: "you are an ass", expectHit: true },
    { input: "kill   yourself", expectHit: true },
    { input: "kill-yourself now", expectHit: true },
    { input: "please kys", expectHit: true },
    { input: "have a nice day", expectHit: false },
  ];
  return tests.map((t) => {
    const result = findBannedContent(t.input);
    const pass = result.hit === t.expectHit;
    return { ...t, result: result.hit, match: result.match, pass };
  });
}
