import { describe, it, expect } from "vitest";
import { getClientIp, phoneDigits } from "@/lib/client-ip";

describe("getClientIp", () => {
  it("reads the first x-forwarded-for address", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "10.1.2.3, 10.9.9.9" },
    });
    expect(getClientIp(req)).toBe("10.1.2.3");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "192.168.0.8" },
    });
    expect(getClientIp(req)).toBe("192.168.0.8");
  });

  it("returns unknown when no headers are present", () => {
    const req = new Request("http://localhost");
    expect(getClientIp(req)).toBe("unknown");
  });
});

describe("phoneDigits", () => {
  it("strips formatting", () => {
    expect(phoneDigits("+7 (900) 123-45-67")).toBe("79001234567");
  });
});
