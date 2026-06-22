import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env, hasSupabase } from "../config/env";

let _supabase: SupabaseClient | null = null;

// Service-role client — bypasses RLS, backend-only. Lazy init so downstream
// modules can import without triggering a connection at module load.
//
// Returns null when Supabase env is not configured. Callers MUST handle null by
// falling back to their in-memory equivalent (news/summary cache, quota). This
// is the graceful-degradation hook that lets the app boot with zero secrets.
//
// NOTE: This is a NEW, standalone Supabase project for MiniCeliq — it shares no
// data with Celiq (README §1, §16). Never point this at Celiq's project.
export function supabase(): SupabaseClient | null {
  if (!hasSupabase()) return null;
  if (!_supabase) {
    _supabase = createClient(
      env.SUPABASE_URL as string,
      env.SUPABASE_SERVICE_ROLE_KEY as string,
      { auth: { persistSession: false } }
    );
  }
  return _supabase;
}
