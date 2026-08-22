window.Campanha = window.Campanha || {};

(function (C) {
  function salvarSessaoLocal() {
    localStorage.setItem(C.config.SESSION_KEY, JSON.stringify({
      token: C.state.token,
      usuario: C.state.usuario
    }));
  }

  function limparSessaoLocal() {
    localStorage.removeItem(C.config.SESSION_KEY);
  }

  function lerSessaoLocal() {
    try {
      return JSON.parse(localStorage.getItem(C.config.SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  }

  C.auth = {
    async entrar(login, senha) {
      if (!C.config.ok()) {
        throw new Error('Configure SUPABASE_URL e SUPABASE_ANON_KEY no arquivo .env.');
      }
      const { data, error } = await C.supabase.rpc('login', {
        p_login: login,
        p_senha: senha
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.erro || 'Falha no login.');
      C.state.token = data.token;
      C.state.usuario = data.usuario;
      salvarSessaoLocal();
    },

    async sair() {
      try {
        if (C.state.token) await C.supabase.rpc('logout', { p_token: C.state.token });
      } catch {
        /* sessão já pode ter expirado */
      }
      C.state.token = null;
      C.state.usuario = null;
      limparSessaoLocal();
      const form = C.utils.$('form-login');
      if (form) form.reset();
      C.nav.mostrarLogin();
    },

    async restaurar() {
      const local = lerSessaoLocal();
      if (!local?.token || !C.config.ok()) return false;
      const { data, error } = await C.supabase.rpc('me', { p_token: local.token });
      if (error || !data?.ok) {
        limparSessaoLocal();
        return false;
      }
      C.state.token = local.token;
      C.state.usuario = data.usuario;
      salvarSessaoLocal();
      return true;
    }
  };
})(window.Campanha);
