window.Campanha = window.Campanha || {};

document.addEventListener('DOMContentLoaded', async () => {
  const C = Campanha;

  C.nav.injetarTelas();
  C.ui.bind();
  C.nav.bind();
  if (C.conta) C.conta.bind();
  if (C.pwa) C.pwa.init();
  Object.values(C.areas).forEach((area) => area.bind && area.bind());
  C.chosen.aplicar();

  if (!C.config.ok()) {
    C.ui.toast('Configure SUPABASE_URL e SUPABASE_ANON_KEY no arquivo .env.', 'erro');
  }

  try {
    C.ui.loading(true);
    const ok = await C.auth.restaurar();
    if (ok) C.nav.mostrarApp();
    else C.nav.mostrarLogin();
  } catch {
    C.nav.mostrarLogin();
  } finally {
    C.ui.loading(false);
  }
});
