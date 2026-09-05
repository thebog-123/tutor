import "server-only";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "@/lib/env";

/**
 * Service-role client. Bypasses row level security entirely, so it is only
 * ever used behind an `requireAdmin()` check — creating accounts (there is no
 * self-signup) and the seed script.
 */
export function createSupabaseAdminClient() {
  return createClient(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
