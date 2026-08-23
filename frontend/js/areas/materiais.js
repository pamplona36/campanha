window.Campanha = window.Campanha || {};

(function (C) {
  const $ = (id) => C.utils.$(id);
  const { esc, preencherSelect, matchFiltro } = C.utils;
  let filtro = '';

  function resetForm() {
    $('form-material').reset();
    $('mat-id').value = '';
    $('mat-form-titulo').textContent = 'Novo material';
    C.chosen.atualizar($('mat-tipo'));
  }

  function listaFiltrada() {
    const itens = C.state.cache.materiais || [];
    return itens.filter((m) => matchFiltro(filtro, m.nome, m.tipo));
  }

  function render() {
    const box = $('lista-materiais');
    const itens = listaFiltrada();
    if (!itens.length) {
      box.innerHTML = C.ui.vazio(filtro ? 'Nenhum material encontrado.' : 'Nenhum material cadastrado.');
      return;
    }
    box.innerHTML = C.ui.listaDupla({
      vazioTexto: 'Nenhum material cadastrado.',
      cards: itens.map((m) => `
        <article class="rounded-3xl bg-white p-4 shadow-card">
          <p class="text-[11px] font-bold uppercase tracking-wide text-brand-700">${esc(m.tipo)}</p>
          <h4 class="text-base font-extrabold">${esc(m.nome)}</h4>
          ${C.ui.botoesCard(m.id, 'materiais')}
        </article>
      `).join(''),
      colunas: ['Nome', 'Tipo', 'Ações'],
      linhas: itens.map((m) => `
        <tr>
          <td class="font-semibold text-slate-900">${esc(m.nome)}</td>
          <td>${esc(m.tipo)}</td>
          <td class="ent-acoes">${C.ui.menuAcoesCrud(m.id, 'materiais')}</td>
        </tr>
      `)
    });
  }

  C.areas.materiais = {
    titulo: 'Materiais',
    subtitulo: 'Itens de campanha por tipo',
    chave: 'materiais',

    html() {
      return `
        <div id="view-materiais" data-view class="hidden space-y-4">
          ${C.ui.barraCrud({
            filtroId: 'filtro-materiais',
            placeholder: 'Filtrar por nome ou tipo',
            botaoId: 'btn-novo-material'
          })}
          <div id="lista-materiais"></div>
          ${C.ui.modalCadastro({
            id: 'modal-material',
            tituloId: 'mat-form-titulo',
            formHtml: `
              <form id="form-material">
                <input type="hidden" id="mat-id" />

                <label class="mb-1 block text-sm font-semibold" for="mat-nome">Nome</label>
                <input id="mat-nome" class="field mb-3" required />

                <label class="mb-1 block text-sm font-semibold" for="mat-tipo">Tipo</label>
                <select id="mat-tipo" class="field mb-4" required></select>

                <div class="flex gap-2">
                  <button type="submit" class="btn-primary flex-1">Salvar</button>
                  <button type="button" id="btn-cancelar-material" class="min-h-[52px] flex-1 rounded-2xl bg-slate-100 font-bold text-slate-600">Cancelar</button>
                </div>
              </form>
            `
          })}
        </div>
      `;
    },

    bind() {
      $('btn-novo-material').addEventListener('click', () => {
        resetForm();
        C.ui.abrirModal('modal-material');
      });
      $('filtro-materiais').addEventListener('input', (ev) => {
        filtro = ev.target.value;
        render();
      });
      $('modal-material').addEventListener('cadastro:fechar', resetForm);
      $('btn-cancelar-material').addEventListener('click', () => C.ui.fecharModal('modal-material'));
      $('form-material').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          C.ui.loading(true);
          await C.api.rpc('salvar_material', {
            p_id: $('mat-id').value || null,
            p_nome: $('mat-nome').value,
            p_tipo: $('mat-tipo').value
          });
          C.ui.fecharModal('modal-material');
          C.ui.toast('Material salvo.');
          await C.areas.materiais.carregar();
        } catch (err) {
          C.ui.toast(C.utils.msgErro(err), 'erro');
        } finally {
          C.ui.loading(false);
        }
      });
    },

    async carregar() {
      await C.api.listasBase();
      preencherSelect($('mat-tipo'), C.state.cache.tipos, {
        value: 'nome',
        label: 'nome',
        placeholder: 'Selecione o tipo'
      });
      render();
    },

    editar(id) {
      const m = C.state.cache.materiais.find((x) => x.id === id);
      if (!m) return;
      $('mat-id').value = m.id;
      $('mat-nome').value = m.nome;
      C.utils.definirSelect($('mat-tipo'), m.tipo);
      $('mat-form-titulo').textContent = 'Editar material';
      C.ui.abrirModal('modal-material');
    },

    excluir(id) {
      return C.api.excluir('excluir_material', id, () => C.areas.materiais.carregar());
    }
  };
})(window.Campanha);
