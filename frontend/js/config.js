window.Campanha = window.Campanha || {};

const SUPABASE_URL = (window.__ENV && window.__ENV.SUPABASE_URL) || '';
const SUPABASE_ANON_KEY = (window.__ENV && window.__ENV.SUPABASE_ANON_KEY) || '';

Campanha.config = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SESSION_KEY: 'campanha_sessao'
};

Campanha.config.ok = function () {
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    SUPABASE_URL.includes('supabase.co') &&
    !SUPABASE_URL.includes('SEU-PROJETO') &&
    SUPABASE_ANON_KEY.length > 20 &&
    !SUPABASE_ANON_KEY.includes('SUA-CHAVE')
  );
};
