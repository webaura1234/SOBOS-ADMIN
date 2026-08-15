import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "https://nitqagswjnptzxehhlkz.supabase.co";

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pdHFhZ3N3am5wdHp4ZWhobGt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAwMDAwMDAsImV4cCI6MjA1NTAwMDAwMH0.placeholder";

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
