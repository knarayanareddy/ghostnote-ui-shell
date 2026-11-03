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
