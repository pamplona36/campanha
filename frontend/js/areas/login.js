window.Campanha = window.Campanha || {};

(function (C) {
  const $ = (id) => C.utils.$(id);

  C.areas.login = {
    titulo: 'Login',
    chave: 'login',

    html() {
      return `
        <div class="hidden lg:flex h-full w-[46%] flex-col justify-center bg-brand-950 px-16 text-white">
          <p class="text-xs font-bold uppercase tracking-[0.22em] text-gold-400">Controle de campanha</p>
          <h1 class="mt-3 text-5xl font-extrabold tracking-tight">Materiais</h1>
          <p class="mt-4 max-w-md text-lg text-white/70">Cadastros, entregas e relatórios em uma única central, no computador ou no celular.</p>
        </div>
        <div class="pointer-events-none absolute inset-0 overflow-hidden lg:hidden">
          <div class="absolute -top-24 -right-16 h-72 w-72 rounded-full bg-brand-700/40 blur-3xl"></div>
          <div class="absolute bottom-10 -left-16 h-64 w-64 rounded-full bg-gold-500/20 blur-3xl"></div>
        </div>
        <div class="safe-top relative z-10 flex flex-1 flex-col justify-center px-5 pb-8 lg:px-16">
          <div class="mx-auto w-full max-w-md">
            <div class="mb-8 text-center text-white lg:hidden">
              <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10 ring-1 ring-white/20">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <p class="text-xs font-bold uppercase tracking-[0.22em] text-gold-400">Controle de campanha</p>
              <h1 class="mt-2 text-3xl font-extrabold tracking-tight">Materiais</h1>
              <p class="mt-2 text-sm text-white/70">Entregas, colaboradores e relatórios em um só lugar.</p>
            </div>
            <div class="mb-6 hidden lg:block">
              <h2 class="text-2xl font-extrabold text-slate-900">Entrar</h2>
              <p class="mt-1 text-sm text-slate-500">Use seu login da equipe da campanha.</p>
            </div>

            <form id="form-login" class="rounded-3xl bg-white p-5 shadow-card lg:p-8">
              <label class="mb-1 block text-sm font-semibold text-slate-700" for="login-usuario">Usuário</label>
              <input id="login-usuario" name="login" autocomplete="username" class="field mb-4" placeholder="Seu login" required />

              <label class="mb-1 block text-sm font-semibold text-slate-700" for="login-senha">Senha</label>
              <div class="relative mb-5">
                <input id="login-senha" name="senha" type="password" autocomplete="current-password" class="field pr-12" placeholder="••••••••" required />
                <button type="button" id="btn-ver-senha" class="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl px-3 py-2 text-slate-500" aria-label="Mostrar senha">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                </button>
              </div>

              <button type="submit" id="btn-entrar" class="btn-primary w-full">Entrar</button>
              <button type="button" data-instalar-app class="mt-3 hidden min-h-[52px] w-full rounded-2xl bg-brand-50 font-bold text-brand-800">
                Instalar no celular
              </button>
            </form>
            <p class="mt-5 text-center text-xs text-white/50 lg:text-slate-400">Acesso restrito à equipe da campanha · ${C.rotuloVersao ? C.rotuloVersao() : ''}</p>
          </div>
        </div>
      `;
    },

    bind() {
      $('form-login').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          C.ui.loading(true);
          await C.auth.entrar($('login-usuario').value, $('login-senha').value);
          C.nav.mostrarApp();
        } catch (err) {
          C.ui.toast(C.utils.msgErro(err), 'erro');
        } finally {
          C.ui.loading(false);
        }
      });

      $('btn-ver-senha').addEventListener('click', () => {
        const input = $('login-senha');
        input.type = input.type === 'password' ? 'text' : 'password';
      });
    }
  };
})(window.Campanha);
