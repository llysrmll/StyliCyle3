if (!window.supabase?.createClient) {
  throw new Error("Supabase JS failed to load. Check the Supabase CDN script.");
}

window.stylicycleSupabase = window.supabase.createClient(
  "https://kjiyvstudiqlmegyqfpg.supabase.co",
  "sb_publishable_SVbMwppVGBSAZGanWksG1Q_H2O67fGy",
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true
    }
  }
);
