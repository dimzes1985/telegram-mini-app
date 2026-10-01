import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

export interface BookingInsert {
  service_id: string;
  user_id: string;
  booking_date: string;
  booking_time: string;
  customer_name: string;
  customer_phone: string | null;
  customer_notes: string | null;
  status: "pending" | "confirmed";
}

export interface BookingInsertExtras {
  source?: string | null;
  customer_messenger_id?: string | null;
}

// PostgREST: column missing from the schema cache (migration not applied).
const UNKNOWN_COLUMN_CODES = new Set(["PGRST204", "42703"]);

// Inserts a booking with the anti-spam metadata columns. If the database has
// not been migrated yet (migration-security-rls.sql), retries without them so
// bookings keep working during the rollout.
export async function insertBooking(
  supabase: SupabaseClient,
  row: BookingInsert,
  extras: BookingInsertExtras,
  select = "*"
): Promise<{ data: Record<string, unknown> | null; error: PostgrestError | null }> {
  const first = await supabase
    .from("bookings")
    .insert({ ...row, ...extras })
    .select(select)
    .single();

  if (first.error && UNKNOWN_COLUMN_CODES.has(first.error.code)) {
    console.warn(
      "bookings.source / customer_messenger_id missing - run migration-security-rls.sql"
    );
    const retry = await supabase.from("bookings").insert(row).select(select).single();
    return {
      data: (retry.data as Record<string, unknown> | null) ?? null,
      error: retry.error,
    };
  }

  return {
    data: (first.data as Record<string, unknown> | null) ?? null,
    error: first.error,
  };
}
