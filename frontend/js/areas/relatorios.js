window.Campanha = window.Campanha || {};

(function (C) {
  const $ = (id) => C.utils.$(id);
  const { esc, formatarData, preencherSelect } = C.utils;

  C.areas.relatorios = {
    titulo: 'Relatórios',
    subtitulo: 'Filtros e listagem da campanha',
    chave: 'relatorio',

    html() {
      return `
        <div id="view-relatorios" data-view class="hidden space-y-4">
          <form id="form-relatorio" class="panel">
            <div class="page-filters">
              <div>
                <label class="mb-1 block text-sm font-semibold" for="rel-colaborador">Colaborador</label>
                <select id="rel-colaborador" class="field"></select>
              </div>
              <div>
                <label class="mb-1 block text-sm font-semibold" for="rel-tipo">Tipo de material</label>
                <select id="rel-tipo" class="field"></select>
              </div>
              <div>
                <label class="mb-1 block text-sm font-semibold" for="rel-status">Status</label>
                <select id="rel-status" class="field no-chosen"></select>
              </div>
              <div>
                <label class="mb-1 block text-sm font-semibold" for="rel-ini">Data inicial</label>
                <input id="rel-ini" type="date" class="field" />
              </div>
              <div>
                <label class="mb-1 block text-sm font-semibold" for="rel-fim">Data final</label>
                <input id="rel-fim" type="date" class="field" />
              </div>
            </div>
            <button type="submit" class="btn-primary mt-4 w-full lg:max-w-xs">Gerar relatório</button>
          </form>

          <div id="lista-relatorio"></div>
        </div>
      `;
    },

    bind() {
      $('form-relatorio').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          C.ui.loading(true);
          const data = await C.api.rpc('relatorio_entregas', {
            p_colaborador_id: $('rel-colaborador').value || null,
            p_tipo: $('rel-tipo').value || null,
            p_status: $('rel-status').value || null,
            p_data_ini: $('rel-ini').value || null,
            p_data_fim: $('rel-fim').value || null
          });
          const itens = data?.itens || [];
          if (!itens.length) {
            $('lista-relatorio').innerHTML = C.ui.vazio('Nenhuma entrega encontrada para esses filtros.');
            return;
          }
          $('lista-relatorio').innerHTML = C.ui.listaDupla({
            vazioTexto: 'Nenhuma entrega encontrada para esses filtros.',
            cards: itens.map((e) => `
              <article class="rounded-3xl bg-white p-4 shadow-card">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-[11px] font-bold uppercase tracking-wide text-brand-700">${esc(e.material_tipo)}</p>
                    <h4 class="text-base font-extrabold">${esc(e.material_nome)} · ${esc(e.quantidade)}</h4>
                    <p class="mt-1 text-sm text-slate-600">${esc(e.colaborador_nome)}</p>
                  </div>
                  <div class="flex flex-col items-end gap-1">
                    <span class="badge-status ${C.utils.classeStatus(e.status)}">${esc(C.utils.rotuloStatus(e.status))}</span>
                    <span class="text-xs font-bold text-slate-500">${formatarData(e.data_entrega)}</span>
                  </div>
                </div>
                <p class="mt-2 text-sm text-slate-600">Recebeu: <strong>${esc(e.quem_recebeu || '—')}</strong></p>
                <p class="text-sm text-slate-600">Entregue por: <strong>${esc(e.entregadores_nomes || e.usuario_nome)}</strong></p>
              </article>
            `).join(''),
            colunas: ['Data', 'Status', 'Material', 'Tipo', 'Qtd', 'Colaborador', 'Recebeu', 'Entregue por'],
            linhas: itens.map((e) => `
              <tr>
                <td>${formatarData(e.data_entrega)}</td>
                <td><span class="badge-status ${C.utils.classeStatus(e.status)}">${esc(C.utils.rotuloStatus(e.status))}</span></td>
                <td class="font-semibold text-slate-900">${esc(e.material_nome)}</td>
                <td>${esc(e.material_tipo)}</td>
                <td>${esc(e.quantidade)}</td>
                <td>${esc(e.colaborador_nome)}</td>
                <td>${esc(e.quem_recebeu || '—')}</td>
                <td>${esc(e.entregadores_nomes || e.usuario_nome)}</td>
              </tr>
            `)
          });
        } catch (err) {
          C.ui.toast(C.utils.msgErro(err), 'erro');
        } finally {
          C.ui.loading(false);
        }
      });
    },

    async carregar() {
      await C.api.listasBase();
      preencherSelect($('rel-colaborador'), C.state.cache.colaboradores, {
        value: 'id',
        label: 'nome',
        placeholder: 'Todos os colaboradores'
      });
      preencherSelect($('rel-tipo'), C.state.cache.tipos, {
        value: 'nome',
        label: 'nome',
        placeholder: 'Todos os tipos'
      });
      preencherSelect($('rel-status'), C.utils.STATUS_ENTREGA, {
        value: 'id',
        label: 'nome',
        placeholder: 'Todos os status'
      });
      if (!$('lista-relatorio').innerHTML) {
        $('lista-relatorio').innerHTML = C.ui.vazio('Use os filtros e toque em Gerar relatório.');
      }
    }
  };
})(window.Campanha);
