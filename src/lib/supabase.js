import { createClient } from '@supabase/supabase-js';

const url = "https://hklmkpjccrmlqyypvkar.supabase.co";
const key = "sb_publishable_ONb39yuLFABaaX0a_3Bg7A_ZKyjMB5p";

if (!url || !key) {
  console.error(
    'Missing Supabase credentials. Copy .env.example to .env and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  );
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
