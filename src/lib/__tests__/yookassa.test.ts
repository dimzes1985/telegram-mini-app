import { describe, it, expect } from "vitest";
import { isYookassaWebhookIp } from "@/lib/yookassa";

describe("isYookassaWebhookIp", () => {
  it("accepts addresses inside the published ЮKassa IPv4 ranges", () => {
    expect(isYookassaWebhookIp("185.71.76.10")).toBe(true);
    expect(isYookassaWebhookIp("185.71.76.31")).toBe(true);
    expect(isYookassaWebhookIp("185.71.77.5")).toBe(true);
    expect(isYookassaWebhookIp("77.75.153.0")).toBe(true);
    expect(isYookassaWebhookIp("77.75.153.127")).toBe(true);
    expect(isYookassaWebhookIp("77.75.154.128")).toBe(true);
    expect(isYookassaWebhookIp("77.75.154.255")).toBe(true);
  });

  it("rejects addresses outside the published IPv4 ranges", () => {
    expect(isYookassaWebhookIp("185.71.76.32")).toBe(false);
    expect(isYookassaWebhookIp("77.75.153.128")).toBe(false);
    expect(isYookassaWebhookIp("77.75.154.127")).toBe(false);
    expect(isYookassaWebhookIp("8.8.8.8")).toBe(false);
    expect(isYookassaWebhookIp("127.0.0.1")).toBe(false);
  });

  it("accepts addresses inside the published IPv6 /64 ranges", () => {
    expect(isYookassaWebhookIp("2a02:5180:0:1509::1")).toBe(true);
    expect(isYookassaWebhookIp("2a02:5180:0:2655::ffff")).toBe(true);
    expect(isYookassaWebhookIp("2a02:5180:0:1533::")).toBe(true);
    expect(isYookassaWebhookIp("2a02:5180:0:164c::dead:beef")).toBe(true);
  });

  it("rejects addresses outside the published IPv6 ranges", () => {
    expect(isYookassaWebhookIp("2a02:5180:0:9999::1")).toBe(false);
    expect(isYookassaWebhookIp("2a02:5180:1:1509::1")).toBe(false);
    expect(isYookassaWebhookIp("2a02:5180:0:2656::1")).toBe(false);
    expect(isYookassaWebhookIp("2001:db8::1")).toBe(false);
  });

  it("rejects empty or malformed input", () => {
    expect(isYookassaWebhookIp("")).toBe(false);
    expect(isYookassaWebhookIp("   ")).toBe(false);
    expect(isYookassaWebhookIp("not-an-ip")).toBe(false);
  });
});
