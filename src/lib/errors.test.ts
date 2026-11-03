import { describe, expect, it } from "vitest";
import { describeError } from "@/lib/errors";

describe("describeError", () => {
  it("recognises an un-migrated database", () => {
    expect(
      describeError({
        message:
          "Could not find the function public.get_my_journal in the schema cache",
        code: "PGRST202",
      }),
    ).toMatchObject({
      title: "The database hasn't been migrated yet",
      fix: "npm run db:push",
    });
  });

  it("recognises disabled anonymous sign-ins", () => {
    expect(describeError(new Error("Anonymous sign-ins are disabled"))).toMatchObject({
      title: "Anonymous sign-ins are disabled",
      fix: expect.stringContaining("Anonymous"),
    });
  });

  it("recognises privilege errors", () => {
    expect(describeError("permission denied for table notes")).toMatchObject({
      title: "This session isn't allowed to do that",
      fix: "npm run db:push",
    });
  });

  it("recognises a rejected key", () => {
    expect(describeError("Invalid API key")).toMatchObject({
      title: "The publishable key was rejected",
    });
  });

  it("recognises network failures", () => {
    expect(describeError(new TypeError("Failed to fetch"))).toMatchObject({
      title: "Can't reach the server",
    });
  });

  it("falls back to the raw message", () => {
    expect(describeError("weird")).toMatchObject({
      title: "Something went wrong",
      description: "weird",
    });
  });
});

describe("describeError — write-path messages", () => {
  it("explains blocked wording without repeating the word", () => {
    const help = describeError("note contains blocked content: fuck");
    expect(help.title).toBe("That wording isn't allowed here");
    expect(help.description).not.toContain("fuck");
  });

  it("explains a length violation", () => {
    expect(describeError("note body must be between 15 and 500 characters").title).toBe(
      "That note is the wrong length",
    );
  });

  it("explains a rate limit", () => {
    expect(describeError("rate limit: at most 10 notes per hour").title).toBe(
      "That's a lot for one hour",
    );
  });
});
