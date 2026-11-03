// S-2 from docs/SECURITY-REDTEAM.md: the filter used to match whole base words
// only, so "fucking", "shitty", "asshole" and every homoglyph walked through —
// here and in the authoritative SQL copy (public.find_banned_content).
//
// These cases mirror supabase/tests/rls.test.sql. When the two drift, one of the
// suites fails — which is the point.

import { describe, expect, it } from "vitest";
import { findBannedContent, foldForFilter } from "./bannedFilter";

describe("content filter — inflections and compounds", () => {
  it.each([
    ["you are a fucking idiot and everyone knows", "fuck"],
    ["he fucked this up for everyone", "fuck"],
    ["what a shitty thing to say", "shit"],
    ["that is bullshit and you know it", "bullshit"],
    ["you are such an asshole to every stranger", "asshole"],
    ["you dumbass, stop writing here", "dumbass"],
    ["the bitches on this app are awful", "bitch"],
    ["you retarded piece of work", "retard"],
    ["this is retardation of the highest order", "retardation"],
    ["you are a motherfucker", "motherfuck"],
    ["you f*cking idiot, go away", "fuck"],
    ["sh1tty behaviour from you", "shit"],
  ])("flags %j as %j", (input, expected) => {
    expect(findBannedContent(input)).toMatchObject({ hit: true, match: expected });
  });
});

describe("content filter — homoglyphs and invisible characters", () => {
  it.each([
    ["you fu\u0441k ing idiot", "fuck"], // Cyrillic с
    ["you \uFF46\uFF55\uFF43\uFF4B ing idiot", "fuck"], // fullwidth
    ["you f\u200Buck ing idiot", "fuck"], // zero-width space
    ["you fu\u0301ck ing idiot", "fuck"], // combining accent
    ["k\u200Bys", "kys"], // zero-width inside a phrase
  ])("flags %j as %j", (input, expected) => {
    expect(findBannedContent(input)).toMatchObject({ hit: true, match: expected });
  });

  it("folds text without changing its meaning", () => {
    expect(foldForFilter("\uFF26\uFF35\uFF23\uFF2B")).toBe("fuck");
  });
});

describe("content filter — ordinary English stays clean", () => {
  it.each([
    "classic kindness, thank you for this",
    "please assess this honestly",
    "I will assume the best of you",
    "the assassin spared everyone",
    "damning with faint praise, honestly",
    "I am proud of you, grade a b student",
    "cocktail hour was lovely",
    "prickly pears are sweet",
    "hope your day gets better, stranger",
  ])("does not flag %j", (input) => {
    expect(findBannedContent(input).hit).toBe(false);
  });
});
