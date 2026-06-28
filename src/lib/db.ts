import { createAdminClient } from "@/utils/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

/** Server-side Supabase client (service role). All API data access goes through here. */
export function db(): SupabaseClient {
  if (!client) {
    client = createAdminClient();
  }
  return client;
}

export function sbError(error: { message: string } | null, context: string): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}
