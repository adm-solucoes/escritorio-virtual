import { createClient } from "@supabase/supabase-js";

// Server-only client using the secret key — never import this from client components.
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const secretKey = process.env.SUPABASE_SECRET_KEY!;
  return createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
