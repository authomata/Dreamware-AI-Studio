import { createClient } from '@supabase/supabase-js';

/**
 * Admin Supabase client — uses service_role key.
 * NEVER import this in client components or expose to the browser.
 * Only use in Server Components, Server Actions, and Route Handlers.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
