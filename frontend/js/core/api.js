window.Campanha = window.Campanha || {};

(function (C) {
  C.api = {
    async rpc(fn, params = {}) {
      const payload = { p_token: C.state.token, ...params };
      const { data, error } = await C.supabase.rpc(fn, payload);
      if (error) throw error;
      return data;
    },

    async listasBase() {
      const [colaboradores, materiais, tipos, equipe] = await Promise.all([
        C.api.rpc('listar_colaboradores'),
        C.api.rpc('listar_materiais'),
        C.api.rpc('listar_tipos'),
        C.api.rpc('listar_equipe')
      ]);
      C.state.cache.colaboradores = colaboradores || [];
      C.state.cache.materiais = materiais || [];
      C.state.cache.tipos = tipos || [];
      C.state.cache.equipe = equipe || [];
    },

    async excluir(fn, id, recarregar) {
      const ok = await C.ui.confirmar('Excluir este registro?');
      if (!ok) return;
      try {
        C.ui.loading(true);
        await C.api.rpc(fn, { p_id: id });
        C.ui.toast('Registro excluído.');
        if (recarregar) await recarregar();
      } catch (err) {
        C.ui.toast(C.utils.msgErro(err), 'erro');
      } finally {
        C.ui.loading(false);
      }
    }
  };
})(window.Campanha);
