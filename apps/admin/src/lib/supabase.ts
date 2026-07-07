import { createClient } from '@supabase/supabase-js';

// Browser client: anon key + Supabase Auth. The access token from the session is
// sent as a Bearer to the Workers API, which verifies it and looks up the staff
// row (see apps/api verifyStaff). The anon key is publishable by design.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } },
);
