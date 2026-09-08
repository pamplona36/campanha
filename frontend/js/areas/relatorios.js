window.Campanha = window.Campanha || {};

(function (C) {
  const $ = (id) => C.utils.$(id);
  const { esc, formatarData, preencherSelect } = C.utils;

  let ultimoRelatorio = null;

  function rotuloFiltroSelect(el, vazio) {
    if (!el || !el.value) return vazio;
    const opt = el.selectedOptions?.[0];
    return (opt && opt.textContent) ? opt.textContent.trim() : vazio;
  }

  function filtrosAtuais() {
    return {
      colaborador: rotuloFiltroSelect($('rel-colaborador'), 'Todos os colaboradores'),
      tipo: rotuloFiltroSelect($('rel-tipo'), 'Todos os tipos'),
      status: rotuloFiltroSelect($('rel-status'), 'Todos os status'),
      ini: $('rel-ini').value || null,
      fim: $('rel-fim').value || null
    };
  }

  function quantitativoPorMaterial(itens) {
    const mapa = new Map();
    for (const e of itens || []) {
      const chave = `${e.material_id || e.material_nome || ''}|${e.material_tipo || ''}`;
      const atual = mapa.get(chave) || {
        nome: e.material_nome || '—',
        tipo: e.material_tipo || '—',
        quantidade: 0
      };
      atual.quantidade += Number(e.quantidade) || 0;
      mapa.set(chave, atual);
    }
    return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  function rotuloPeriodo(filtros) {
    if (filtros.ini && filtros.fim) return `${formatarData(filtros.ini)} a ${formatarData(filtros.fim)}`;
    if (filtros.ini) return `A partir de ${formatarData(filtros.ini)}`;
    if (filtros.fim) return `Até ${formatarData(filtros.fim)}`;
    return 'Todo o período';
  }

  function htmlPrint(rel) {
    const filtros = rel.filtros;
    const totais = rel.totais || {};
    const linhas = rel.itens.map((e) => `
      <tr>
        <td>${esc(formatarData(e.data_entrega))}</td>
        <td>${esc(C.utils.rotuloStatus(e.status))}</td>
        <td>${esc(e.material_nome || '—')}</td>
        <td>${esc(e.material_tipo || '—')}</td>
        <td>${esc(String(e.quantidade ?? ''))}</td>
        <td>${esc(e.colaborador_nome || '—')}</td>
        <td>${esc(e.quem_recebeu || '—')}</td>
        <td>${esc(e.entregadores_nomes || e.usuario_nome || '—')}</td>
      </tr>
    `).join('');
    const resumo = quantitativoPorMaterial(rel.itens);
    const totalResumo = resumo.reduce((acc, item) => acc + item.quantidade, 0);
    const linhasResumo = resumo.map((item) => `
      <tr>
        <td>${esc(item.nome)}</td>
        <td>${esc(item.tipo)}</td>
        <td>${esc(String(item.quantidade))}</td>
      </tr>
    `).join('');
    return `
      <p class="relatorio-print-kicker">Campanha · Materiais</p>
      <h1>Relatório de entregas</h1>
      <p class="relatorio-print-meta">
        Período: ${esc(rotuloPeriodo(filtros))}
        · Gerado em ${esc(formatarData(C.utils.hojeISO()))}
      </p>
      <p class="relatorio-print-meta">
        Colaborador: ${esc(filtros.colaborador)}
        · Tipo: ${esc(filtros.tipo)}
        · Status: ${esc(filtros.status)}
      </p>
      <p class="relatorio-print-totais">
        Entregas: ${esc(String(totais.entregas ?? rel.itens.length))}
        · Quantidade: ${esc(String(totais.quantidade ?? '—'))}
      </p>
      <table>
        <thead>
          <tr>
            <th>Data</th><th>Status</th><th>Material</th><th>Tipo</th>
            <th>Qtd</th><th>Colaborador</th><th>Recebeu</th><th>Entregue por</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
      <h2>Quantitativo por material</h2>
      <table class="relatorio-print-resumo">
        <thead>
          <tr>
            <th>Material</th><th>Tipo</th><th>Qtd</th>
          </tr>
        </thead>
        <tbody>${linhasResumo}</tbody>
        <tfoot>
          <tr>
            <th colspan="2">Total</th>
            <th>${esc(String(totalResumo))}</th>
          </tr>
        </tfoot>
      </table>
    `;
  }

  function garantirAreaPrint() {
    let el = $('relatorio-print');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'relatorio-print';
    el.className = 'relatorio-print';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    return el;
  }

  function gerarPdf() {
    const rel = ultimoRelatorio;
    if (!rel?.itens?.length) {
      C.ui.toast('Gere o relatório antes de exportar o PDF.', 'erro');
      return;
    }
    const area = garantirAreaPrint();
    area.innerHTML = htmlPrint(rel);
    const tituloAnterior = document.title;
    document.title = `relatorio-entregas-${C.utils.hojeISO()}`;
    const restaurar = () => {
      document.title = tituloAnterior;
      window.removeEventListener('afterprint', restaurar);
    };
    window.addEventListener('afterprint', restaurar);
    C.ui.toast('Na janela de impressão, escolha Salvar como PDF.');
    window.print();
    setTimeout(restaurar, 1500);
  }

  function renderRelatorio(itens, totais) {
    const box = $('lista-relatorio');
    if (!itens.length) {
      ultimoRelatorio = null;
      box.innerHTML = C.ui.vazio('Nenhuma entrega encontrada para esses filtros.');
      return;
    }
    box.innerHTML = `
      <div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-sm font-semibold text-slate-600">
          ${esc(String(totais.entregas || itens.length))} entrega(s) · ${esc(String(totais.quantidade ?? '—'))} material(is)
        </p>
        <button type="button" id="btn-relatorio-pdf" class="btn-print w-full sm:w-auto sm:min-w-[220px] px-5">
          ${C.ui.icone('impressora')}
          Imprimir relatório
        </button>
      </div>
      ${C.ui.listaDupla({
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
      })}
    `;
  }

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
          const filtros = filtrosAtuais();
          const data = await C.api.rpc('relatorio_entregas', {
            p_colaborador_id: $('rel-colaborador').value || null,
            p_tipo: $('rel-tipo').value || null,
            p_status: $('rel-status').value || null,
            p_data_ini: filtros.ini,
            p_data_fim: filtros.fim
          });
          const itens = data?.itens || [];
          const totais = data?.totais || {};
          ultimoRelatorio = itens.length ? { itens, totais, filtros } : null;
          renderRelatorio(itens, totais);
        } catch (err) {
          C.ui.toast(C.utils.msgErro(err), 'erro');
        } finally {
          C.ui.loading(false);
        }
      });

      $('lista-relatorio').addEventListener('click', (ev) => {
        if (!ev.target.closest('#btn-relatorio-pdf')) return;
        try {
          gerarPdf();
        } catch (err) {
          C.ui.toast(C.utils.msgErro(err), 'erro');
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
