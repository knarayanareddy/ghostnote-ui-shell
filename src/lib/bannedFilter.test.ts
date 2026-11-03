import { describe, expect, it } from "vitest";
import {
  collapseLetterRuns,
  condenseForFilter,
  findBannedContent,
  normalizeForFilter,
  stripVowels,
} from "@/lib/bannedFilter";

// These cases must stay in sync with public.find_banned_content() in
// supabase/migrations/20261103090000_security_hardening.sql.
describe("findBannedContent", () => {
  describe("innocent text", () => {
    it.each([
      "class is great",
      "pass the ball",
      "compass reading",
      "grassy field",
      "have a nice day",
      "the whole class passed the compass test",
      "I passed my exam, so proud of you",
      "assist me with the passage",
      "grab a coffee and breathe",
      "hmm, psst, look at the class",
      "i a m proud of you, grade a b student",
      "option a. b. c. all look fine",
    ])("does not flag %j", (text) => {
      expect(findBannedContent(text).hit).toBe(false);
    });
  });

  describe("plain hits", () => {
    it("flags a standalone slur", () => {
      const result = findBannedContent("you are an ass");
      expect(result).toMatchObject({ hit: true, match: "ass", type: "word" });
    });

    it("flags a phrase", () => {
      expect(findBannedContent("please kys")).toMatchObject({
        hit: true,
        match: "kys",
        type: "phrase",
      });
    });
  });

  describe("evasions", () => {
    it.each([
      ["f*ck you", "fuck"],
      ["what the f.u.c.k", "fuck"],
      ["fck", "fuck"],
      ["sh1t happens", "shit"],
      ["you b4stard", "bastard"],
      ["@ss", "ass"],
      ["kill-yourself", "kill yourself"],
      ["kill   yourself", "kill yourself"],
    ])("flags %j as %j", (input, expected) => {
      expect(findBannedContent(input)).toMatchObject({ hit: true, match: expected });
    });

    it.each([
      ["f u c k this", "fuck"],
      ["k i l l y o u r s e l f", "kill yourself"],
      ["what the s h i t", "shit"],
    ])("joins letter-spaced text %j", (input, expected) => {
      expect(findBannedContent(input)).toMatchObject({ hit: true, match: expected });
    });

    it("does not merge scattered single letters into a false positive", () => {
      // "i a m" becomes "iam" — which must not trip any rule.
      expect(findBannedContent("i a m proud of you, grade a b student").hit).toBe(false);
    });
  });

  it("returns a canonical match rather than the evasive spelling", () => {
    expect(findBannedContent("what the f*ck").match).toBe("fuck");
  });

  it("handles empty input", () => {
    expect(findBannedContent("")).toEqual({ hit: false, match: null, type: null });
  });
});

describe("filter primitives", () => {
  it("normalises punctuation to single spaces", () => {
    expect(normalizeForFilter("  Hello,   WORLD!!  ")).toBe("hello world");
  });

  it("condenses punctuation away", () => {
    expect(condenseForFilter("f*ck this")).toBe("fck this");
  });

  it("strips vowels and collapses whitespace", () => {
    expect(stripVowels("f u c k  this")).toBe("f c k ths");
  });

  it("joins runs of single letters only", () => {
    expect(collapseLetterRuns("f u c k this")).toBe("fuck this");
    expect(collapseLetterRuns("grade a b student")).toBe("grade ab student");
    expect(collapseLetterRuns("hello world")).toBe("hello world");
  });
});
