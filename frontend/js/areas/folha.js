window.Campanha = window.Campanha || {};

(function (C) {
  const $ = (id) => C.utils.$(id);
  const { esc, formatarData, formatarMoeda, formatarCpf, rotuloBanco } = C.utils;

  function rotuloForma(forma) {
    return ({ dinheiro: 'Dinheiro', deposito: 'Depósito', pix: 'PIX' })[forma] || '';
  }

  let situacao = 'pago';

  function inicioMesISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }

  function fimMesISO() {
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  }

  function garantirPeriodo() {
    if ($('folha-ini') && !$('folha-ini').value) $('folha-ini').value = inicioMesISO();
    if ($('folha-fim') && !$('folha-fim').value) $('folha-fim').value = fimMesISO();
  }

  function badgeSituacao(sit) {
    if (sit === 'pago') {
      return '<span class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">Pago</span>';
    }
    return '<span class="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">Em aberto</span>';
  }

  function dadosBanco(item) {
    const partes = [];
    if (item.banco) partes.push(rotuloBanco(item.banco));
    if (item.agencia) partes.push(`Ag. ${item.agencia}`);
    if (item.conta) partes.push(`Cc. ${item.conta}`);
    return partes.join(' · ') || '—';
  }

  function cardTotal(rotulo, valor, extra) {
    return `
      <article class="rounded-3xl bg-white p-4 shadow-card">
        <p class="text-[11px] font-bold uppercase tracking-wide text-slate-500">${esc(rotulo)}</p>
        <p class="mt-1 text-xl font-extrabold text-slate-900">${valor}</p>
        ${extra ? `<p class="mt-0.5 text-xs font-semibold text-slate-500">${extra}</p>` : ''}
      </article>
    `;
  }

  function pintarChips() {
    const box = $('folha-filtro-status');
    if (!box) return;
    const chip = (id, label) => {
      const ativo = situacao === id;
      return `<button type="button" data-folha-sit="${esc(id)}"
        class="chip-status ${id === 'pago' ? 'chip-status-entregue' : id === 'aberto' ? 'chip-status-entrega_iniciada' : 'chip-status-todos'}${ativo ? ' is-on' : ''}">${esc(label)}</button>`;
    };
    box.innerHTML = [
      chip('', 'Todos'),
      chip('pago', 'Pagos'),
      chip('aberto', 'Em aberto')
    ].join('');
  }

  function htmlPagamentos(item) {
    const lista = Array.isArray(item.pagamentos) ? item.pagamentos : [];
    if (!lista.length) return '';
    return `<ul class="mt-2 space-y-1">${lista.map((p) => `
      <li class="flex items-center justify-between gap-2 text-sm text-slate-600">
        <span>${formatarData(p.data_pagamento)} · ${esc(formatarMoeda(p.valor))}${rotuloForma(p.forma) ? ` · ${esc(rotuloForma(p.forma))}` : ''}</span>
        ${p.tem_comprovante ? `<button type="button" data-folha-ver="${esc(p.id)}" class="rounded-lg bg-sky-50 px-2 py-1 text-xs font-bold text-sky-800">Comprovante</button>` : ''}
      </li>
    `).join('')}</ul>`;
  }

  function render(data) {
    const box = $('lista-folha');
    const itens = data?.itens || [];
    const t = data?.totais || {};
    const totais = `
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        ${cardTotal('Na folha', String(t.colaboradores || 0), `${t.pagos || 0} pagos · ${t.abertos || 0} em aberto`)}
        ${cardTotal('Valor da folha', esc(formatarMoeda(t.valor_folha)), 'Soma dos valores mensais')}
        ${cardTotal('Pago no período', esc(formatarMoeda(t.valor_pago)), `${t.pagos || 0} colaborador(es)`)}
        ${cardTotal('Em aberto', esc(formatarMoeda(t.valor_aberto)), `${t.abertos || 0} colaborador(es)`)}
      </div>
    `;
    if (!itens.length) {
      box.innerHTML = `${totais}<div class="mt-4">${C.ui.vazio('Nenhum colaborador nesta situação para o período.')}</div>`;
      return;
    }
    box.innerHTML = `${totais}<div class="mt-4">${C.ui.listaDupla({
      vazioTexto: 'Nenhum registro.',
      cards: itens.map((item) => `
        <article class="rounded-3xl bg-white p-4 shadow-card">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h4 class="text-base font-extrabold text-slate-900">${esc(item.colaborador_nome)}</h4>
              <p class="mt-1 text-sm text-slate-600">${esc(item.cpf ? formatarCpf(item.cpf) : 'CPF não informado')}</p>
              <p class="text-sm text-slate-500">${esc(dadosBanco(item))}</p>
            </div>
            ${badgeSituacao(item.situacao)}
          </div>
          <div class="mt-3 grid grid-cols-1 gap-1 text-sm text-slate-600">
            <p>Folha: <strong class="text-slate-800">${esc(formatarMoeda(item.valor_mensal))}</strong></p>
            ${item.situacao === 'pago'
              ? `<p>Pago: <strong class="text-emerald-800">${esc(formatarMoeda(item.valor_pago))}</strong>${item.ultima_data ? ` · ${formatarData(item.ultima_data)}` : ''}</p>`
              : '<p>Ainda sem pagamento neste período.</p>'}
          </div>
          ${htmlPagamentos(item)}
        </article>
      `).join(''),
      colunas: ['Colaborador', 'Situação', 'Folha', 'Pago', 'Banco', 'Ações'],
      linhas: itens.map((item) => {
        const pags = Array.isArray(item.pagamentos) ? item.pagamentos : [];
        const acoes = pags.length
          ? pags.map((p) => p.tem_comprovante
            ? `<button type="button" data-folha-ver="${esc(p.id)}" class="rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800">Comprovante ${formatarData(p.data_pagamento)}</button>`
            : `<span class="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">${esc(rotuloForma(p.forma) || 'Pago')} ${formatarData(p.data_pagamento)}</span>`
          ).join('')
          : '—';
        return `
          <tr>
            <td class="font-semibold text-slate-900">${esc(item.colaborador_nome)}</td>
            <td>${badgeSituacao(item.situacao)}</td>
            <td>${esc(formatarMoeda(item.valor_mensal))}</td>
            <td>${item.situacao === 'pago' ? esc(formatarMoeda(item.valor_pago)) : '—'}</td>
            <td>${esc(dadosBanco(item))}</td>
            <td><div class="flex flex-wrap justify-end gap-2">${acoes}</div></td>
          </tr>
        `;
      })
    })}</div>`;
  }

  async function consultar({ loading = true } = {}) {
    garantirPeriodo();
    const ini = $('folha-ini').value;
    const fim = $('folha-fim').value;
    if (ini && fim && ini > fim) {
      C.ui.toast('A data inicial não pode ser maior que a data final.', 'erro');
      return;
    }
    try {
      if (loading) C.ui.loading(true);
      const data = await C.api.rpc('relatorio_folha_pagamento', {
        p_data_ini: ini || null,
        p_data_fim: fim || null,
        p_situacao: situacao || null
      });
      render(data);
    } catch (err) {
      C.ui.toast(C.utils.msgErro(err), 'erro');
    } finally {
      if (loading) C.ui.loading(false);
    }
  }

  C.areas.folha = {
    titulo: 'Folha de pagamento',
    subtitulo: 'Pagos e em aberto no período',
    chave: 'folha',

    html() {
      return `
        <div id="view-folha" data-view class="hidden space-y-4">
          <form id="form-folha" class="panel">
            <div class="page-filters">
              <div>
                <label class="mb-1 block text-sm font-semibold" for="folha-ini">Data inicial</label>
                <input id="folha-ini" type="date" class="field" />
              </div>
              <div>
                <label class="mb-1 block text-sm font-semibold" for="folha-fim">Data final</label>
                <input id="folha-fim" type="date" class="field" />
              </div>
            </div>
            <div id="folha-filtro-status" class="mt-3 flex flex-wrap gap-2"></div>
            <button type="submit" class="btn-primary mt-4 w-full lg:max-w-xs">Consultar folha</button>
          </form>
          <div id="lista-folha"></div>
          ${C.ui.modalCadastro({
            id: 'modal-folha-comprovante',
            tituloId: 'folha-ver-titulo',
            formHtml: `
              <img id="folha-ver-img" alt="Comprovante" class="mb-4 max-h-[70vh] w-full rounded-2xl bg-slate-50 object-contain" />
              <button type="button" id="btn-fechar-folha-comprovante" class="btn-primary w-full">Fechar</button>
            `
          })}
        </div>
      `;
    },

    bind() {
      $('form-folha').addEventListener('submit', (ev) => {
        ev.preventDefault();
        consultar();
      });
      $('folha-filtro-status').addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-folha-sit]');
        if (!btn) return;
        situacao = btn.dataset.folhaSit || '';
        pintarChips();
        consultar();
      });
      $('btn-fechar-folha-comprovante').addEventListener('click', () => {
        C.ui.fecharModal('modal-folha-comprovante');
      });
      $('lista-folha').addEventListener('click', async (ev) => {
        const btn = ev.target.closest('[data-folha-ver]');
        if (!btn) return;
        try {
          C.ui.loading(true);
          const pag = await C.api.rpc('obter_pagamento_folha', { p_id: btn.dataset.folhaVer });
          $('folha-ver-titulo').textContent = `Comprovante · ${formatarData(pag.data_pagamento)}`;
          $('folha-ver-img').src = pag.comprovante || '';
          C.ui.abrirModal('modal-folha-comprovante');
        } catch (err) {
          C.ui.toast(C.utils.msgErro(err), 'erro');
        } finally {
          C.ui.loading(false);
        }
      });
    },

    async carregar() {
      if (!C.utils.podeFolha()) {
        C.nav.irPara('entregas');
        return;
      }
      garantirPeriodo();
      pintarChips();
      await consultar({ loading: false });
    }
  };
})(window.Campanha);
