import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requireDemoUser } from "@/lib/demo-auth";

type AuthUser = { id: string; email?: string | null };

export async function createClient() {
  if (!isSupabaseConfigured()) {
    const user = await requireDemoUser();
    return {
      auth: {
        getUser: async () => ({ data: { user: user as AuthUser | null }, error: null }),
      },
      from() {
        throw new Error("DEMO_MODE");
      },
    } as never;
  }

  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component - ignore
          }
        },
      },
    }
  );
}
