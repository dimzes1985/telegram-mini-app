import { describe, it, expect } from "vitest";
import {
  parseJsonBody,
  invalidJsonResponse,
  uuidString,
  dateString,
  timeString,
} from "@/lib/http";

describe("parseJsonBody", () => {
  it("parses a valid JSON body", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ a: 1 }),
      headers: { "Content-Type": "application/json" },
    });
    expect(await parseJsonBody(req)).toEqual({ a: 1 });
  });

  it("returns undefined for malformed JSON", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: "{ not json",
    });
    expect(await parseJsonBody(req)).toBeUndefined();
  });

  it("returns undefined for an empty body", async () => {
    const req = new Request("http://localhost", { method: "POST", body: "" });
    expect(await parseJsonBody(req)).toBeUndefined();
  });
});

describe("invalidJsonResponse", () => {
  it("returns a 400 response", () => {
    const res = invalidJsonResponse();
    expect(res.status).toBe(400);
  });
});

describe("shared zod shapes", () => {
  it("accepts valid date and time strings", () => {
    expect(dateString.safeParse("2026-09-19").success).toBe(true);
    expect(timeString.safeParse("09:30").success).toBe(true);
  });

  it("rejects invalid date and time strings", () => {
    expect(dateString.safeParse("19-09-2026").success).toBe(false);
    expect(dateString.safeParse("not-a-date").success).toBe(false);
    expect(timeString.safeParse("9:30").success).toBe(false);
    expect(timeString.safeParse("09:30:00").success).toBe(false);
  });

  it("rejects empty uuid-like strings", () => {
    expect(uuidString.safeParse("").success).toBe(false);
    expect(uuidString.safeParse("abc-123").success).toBe(true);
  });
});
