// Known gaps in the content filter, tracked as *expected failures*.
//
// The filter matches whole base words only. Adding a suffix, a compound or a
// homoglyph walks straight past it — in the client copy AND in the SQL copy
// (public.find_banned_content), which is the authoritative one. These cases are
// marked `it.fails` so the suite stays green while the gap exists, and turns red
// the moment somebody fixes the filter — which is the signal to delete the
// marker and keep the assertion.
//
// See docs/SECURITY-REDTEAM.md, finding S-2.

import { describe, expect, it } from "vitest";
import { findBannedContent } from "./bannedFilter";

const sentences = {
  inflected: "you are a fucking idiot and everyone here knows it",
  past: "he fucked this up for everyone in the group",
  compound: "you are such an asshole to every person here",
  adverb: "that was a shitty thing to say to a stranger",
  punctuationInflection: "you f*cking idiot, go away right now",
  fullwidth: "you \uFF46\uFF55\uFF43\uFF4B ing idiot go away",
  cyrillic: "you fu\u0441k ing idiot go away", // Cyrillic "с"
};

describe("content filter — known gaps (expected failures)", () => {
  for (const [name, text] of Object.entries(sentences)) {
    it.fails(`does not yet catch: ${name}`, () => {
      expect(findBannedContent(text).hit).toBe(true);
    });
  }
});
