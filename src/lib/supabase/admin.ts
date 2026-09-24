import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Shared service-role client for the SaaS backend paths (billing,
// usage, audit, admin) where there is no calling `auth.uid()` or we
// need to bypass RLS deliberately. Mirrors the pattern in
// src/lib/ai/admin-client.ts and friends.
let _adminClient: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _adminClient
}