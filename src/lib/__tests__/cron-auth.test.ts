import { describe, it, expect } from "vitest";
import { isCronRequestAuthorized } from "@/lib/cron-auth";

const SECRET = "super-secret-cron-value";

describe("isCronRequestAuthorized", () => {
  it("accepts the matching bearer token", () => {
    expect(isCronRequestAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("rejects a wrong token of the same length", () => {
    const wrong = SECRET.replace(/./g, "x");
    expect(isCronRequestAuthorized(`Bearer ${wrong}`, SECRET)).toBe(false);
  });

  it("rejects a token of a different length", () => {
    expect(isCronRequestAuthorized("Bearer short", SECRET)).toBe(false);
  });

  it("rejects a missing authorization header", () => {
    expect(isCronRequestAuthorized(null, SECRET)).toBe(false);
  });

  it("rejects a header without the Bearer scheme", () => {
    expect(isCronRequestAuthorized(SECRET, SECRET)).toBe(false);
  });

  it("fails closed when the secret is not configured", () => {
    expect(isCronRequestAuthorized(`Bearer ${SECRET}`, undefined)).toBe(false);
    expect(isCronRequestAuthorized(`Bearer ${SECRET}`, "")).toBe(false);
  });
});
