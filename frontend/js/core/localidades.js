window.Campanha = window.Campanha || {};

(function (C) {
  const cacheEstados = [];
  const cacheCidades = {};
  const PADRAO = { uf: 'SP', cidade: 'Araçariguama' };

  C.localidades = {
    padrao() {
      return { ...PADRAO };
    },

    async estados() {
      if (cacheEstados.length) return cacheEstados;
      const lista = await C.api.rpc('listar_estados');
      cacheEstados.splice(0, cacheEstados.length, ...(lista || []));
      return cacheEstados;
    },

    async cidades(uf) {
      const chave = String(uf || '').trim().toUpperCase();
      if (!chave) return [];
      if (cacheCidades[chave]) return cacheCidades[chave];
      const lista = await C.api.rpc('listar_cidades', { p_estado: chave });
      cacheCidades[chave] = lista || [];
      return cacheCidades[chave];
    },

    preencherEstados(select, selecionado) {
      return C.localidades.estados().then((lista) => {
        C.utils.preencherSelect(select, lista.map((e) => ({
          id: e.uf,
          nome: `${e.uf} — ${e.nome}`
        })), {
          value: 'id',
          label: 'nome',
          placeholder: 'Selecione o estado'
        });
        if (selecionado) C.utils.definirSelect(select, String(selecionado).toUpperCase());
      });
    },

    async preencherCidades(select, uf, selecionada) {
      const lista = await C.localidades.cidades(uf);
      const itens = lista.map((c) => ({ id: c.nome, nome: c.nome }));
      if (selecionada && !itens.some((c) => c.id === selecionada)) {
        itens.unshift({ id: selecionada, nome: selecionada });
      }
      C.utils.preencherSelect(select, itens, {
        value: 'id',
        label: 'nome',
        placeholder: uf ? 'Selecione a cidade' : 'Selecione o estado primeiro'
      });
      if (selecionada) C.utils.definirSelect(select, selecionada);
    },

    async aplicarPadrao(selectEstado, selectCidade) {
      const { uf, cidade } = PADRAO;
      await C.localidades.preencherEstados(selectEstado, uf);
      await C.localidades.preencherCidades(selectCidade, uf, cidade);
    }
  };
})(window.Campanha);
