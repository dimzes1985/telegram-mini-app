import { cookies } from "next/headers";
import { DEMO_COOKIE, demoUser } from "@/lib/demo-store";

export async function isDemoAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return store.get(DEMO_COOKIE)?.value === "1";
}

export async function requireDemoUser() {
  if (await isDemoAuthenticated()) {
    return demoUser();
  }
  return null;
}
