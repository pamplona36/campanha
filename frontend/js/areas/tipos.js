window.Campanha = window.Campanha || {};

(function (C) {
  const $ = (id) => C.utils.$(id);
  const { esc, matchFiltro } = C.utils;
  let filtro = '';

  function resetForm() {
    $('form-tipo').reset();
    $('tipo-id').value = '';
    $('tipo-form-titulo').textContent = 'Novo tipo';
  }

  function listaFiltrada() {
    const itens = C.state.cache.tipos || [];
    return itens.filter((t) => matchFiltro(filtro, t.nome));
  }

  function render() {
    const box = $('lista-tipos');
    const itens = listaFiltrada();
    if (!itens.length) {
      box.innerHTML = C.ui.vazio(filtro ? 'Nenhum tipo encontrado.' : 'Nenhum tipo cadastrado.');
      return;
    }
    box.innerHTML = C.ui.listaDupla({
      vazioTexto: 'Nenhum tipo cadastrado.',
      cards: itens.map((t) => `
        <article class="rounded-3xl bg-white p-4 shadow-card">
          <h4 class="text-base font-extrabold">${esc(t.nome)}</h4>
          ${C.ui.botoesCard(t.id, 'tipos')}
        </article>
      `).join(''),
      colunas: ['Tipo', 'Ações'],
      linhas: itens.map((t) => `
        <tr>
          <td class="font-semibold text-slate-900">${esc(t.nome)}</td>
          <td class="ent-acoes">${C.ui.menuAcoesCrud(t.id, 'tipos')}</td>
        </tr>
      `)
    });
  }

  C.areas.tipos = {
    titulo: 'Tipos de material',
    subtitulo: 'Categorias usadas no cadastro de materiais',
    chave: 'tipos',

    html() {
      return `
        <div id="view-tipos" data-view class="hidden space-y-4">
          ${C.ui.barraCrud({
            filtroId: 'filtro-tipos',
            placeholder: 'Filtrar tipo',
            botaoId: 'btn-novo-tipo'
          })}
          <div id="lista-tipos"></div>
          ${C.ui.modalCadastro({
            id: 'modal-tipo',
            tituloId: 'tipo-form-titulo',
            formHtml: `
              <form id="form-tipo" novalidate>
                <input type="hidden" id="tipo-id" />

                <label class="mb-1 block text-sm font-semibold" for="tipo-nome">Nome do tipo</label>
                <input id="tipo-nome" class="field mb-4" placeholder="Ex.: Santinho" required />

                <div class="flex gap-2">
                  <button type="submit" class="btn-primary flex-1">Salvar</button>
                  <button type="button" id="btn-cancelar-tipo" class="min-h-[52px] flex-1 rounded-2xl bg-slate-100 font-bold text-slate-600">Cancelar</button>
                </div>
              </form>
            `
          })}
        </div>
      `;
    },

    bind() {
      $('btn-novo-tipo').addEventListener('click', () => {
        resetForm();
        C.ui.abrirModal('modal-tipo');
      });
      $('filtro-tipos').addEventListener('input', (ev) => {
        filtro = ev.target.value;
        render();
      });
      $('modal-tipo').addEventListener('cadastro:fechar', resetForm);
      $('btn-cancelar-tipo').addEventListener('click', () => C.ui.fecharModal('modal-tipo'));
      $('form-tipo').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if (!C.ui.validarObrigatorios(ev.currentTarget)) return;
        try {
          C.ui.loading(true);
          await C.api.rpc('salvar_tipo', {
            p_id: $('tipo-id').value || null,
            p_nome: $('tipo-nome').value
          });
          C.ui.fecharModal('modal-tipo');
          C.ui.toast('Tipo salvo.');
          await C.areas.tipos.carregar();
        } catch (err) {
          C.ui.toast(C.utils.msgErro(err), 'erro');
        } finally {
          C.ui.loading(false);
        }
      });
    },

    async carregar() {
      const lista = await C.api.rpc('listar_tipos');
      C.state.cache.tipos = lista || [];
      render();
    },

    editar(id) {
      const t = C.state.cache.tipos.find((x) => x.id === id);
      if (!t) return;
      $('tipo-id').value = t.id;
      $('tipo-nome').value = t.nome;
      $('tipo-form-titulo').textContent = 'Editar tipo';
      C.ui.abrirModal('modal-tipo');
    },

    excluir(id) {
      return C.api.excluir('excluir_tipo', id, () => C.areas.tipos.carregar());
    }
  };
})(window.Campanha);
