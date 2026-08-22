window.Campanha = window.Campanha || {};

(function (C) {
  const { createClient } = window.supabase;
  C.supabase = createClient(C.config.SUPABASE_URL, C.config.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
})(window.Campanha);
