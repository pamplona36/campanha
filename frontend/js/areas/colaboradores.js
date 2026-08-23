window.Campanha = window.Campanha || {};

(function (C) {
  const $ = (id) => C.utils.$(id);
  const { esc, formatarData, formatarMoeda, formatarCpf, formatarTelefone, cpfValido, telefoneValido, soDigitos, rotuloBanco, matchFiltro, hojeISO } = C.utils;

  let folha = false;
  let filtro = '';
  let pagamentoColab = null;
  let comprovanteAtual = '';
  let ocrTexto = '';

  function setFolha(on) {
    folha = Boolean(on);
    const btn = $('col-folha');
    if (!btn) return;
    btn.classList.toggle('on', folha);
    btn.setAttribute('aria-pressed', String(folha));
    $('wrap-folha-dados').classList.toggle('hidden', !folha);
    $('col-valor').required = folha;
    $('col-banco').required = folha;
    $('col-agencia').required = folha;
    $('col-conta').required = folha;
    if (!folha) {
      $('col-valor').value = '';
      C.utils.definirSelect($('col-banco'), '');
      $('col-agencia').value = '';
      $('col-conta').value = '';
    } else {
      C.chosen.atualizar($('col-banco'));
    }
  }

  function resetForm() {
    $('form-colaborador').reset();
    $('col-id').value = '';
    $('col-form-titulo').textContent = 'Novo colaborador';
    setFolha(false);
    C.localidades.aplicarPadrao($('col-estado'), $('col-cidade'));
    C.chosen.atualizar($('col-banco'));
  }

  function montarBancos() {
    const bancos = (C.BANCOS || []).slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .map((b) => ({ code: b.code, label: `${b.code} — ${b.name}` }));
    C.utils.preencherSelect($('col-banco'), bancos, {
      value: 'code',
      label: 'label',
      placeholder: 'Selecione o banco'
    });
  }

  function listaFiltrada() {
    const itens = C.state.cache.colaboradores || [];
    return itens.filter((c) => matchFiltro(
      filtro,
      c.nome,
      formatarCpf(c.cpf),
      c.cpf,
      formatarTelefone(c.telefone),
      c.telefone,
      c.endereco,
      c.bairro,
      c.cidade,
      c.estado,
      rotuloBanco(c.banco),
      c.agencia,
      c.conta,
      c.folha ? 'folha sim' : 'nao'
    ));
  }

  function botoesColaborador(c, compacto) {
    const pagar = c.folha
      ? (compacto
        ? `<button type="button" data-col-acao="pagar" data-id="${esc(c.id)}" class="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">Pagamento</button>`
        : `<button type="button" data-col-acao="pagar" data-id="${esc(c.id)}" class="min-h-[44px] flex-1 rounded-xl bg-emerald-50 text-sm font-bold text-emerald-800">Pagamento</button>`)
      : '';
    if (compacto) {
      return `<div class="flex flex-wrap justify-end gap-2">${pagar}${C.ui.botoesLinha(c.id, 'colaboradores')}</div>`;
    }
    return `
      <div class="mt-3 flex gap-2">
        ${pagar}
        <button type="button" data-edit="colaboradores" data-id="${esc(c.id)}"
          class="min-h-[44px] flex-1 rounded-xl bg-brand-50 text-sm font-bold text-brand-800">Editar</button>
        <button type="button" data-del="colaboradores" data-id="${esc(c.id)}"
          class="min-h-[44px] flex-1 rounded-xl bg-red-50 text-sm font-bold text-red-700">Excluir</button>
      </div>
    `;
  }

  function render() {
    const box = $('lista-colaboradores');
    const itens = listaFiltrada();
    if (!itens.length) {
      box.innerHTML = C.ui.vazio(filtro ? 'Nenhum colaborador encontrado.' : 'Nenhum colaborador cadastrado.');
      return;
    }
    box.innerHTML = C.ui.listaDupla({
      vazioTexto: 'Nenhum colaborador cadastrado.',
      cards: itens.map((c) => {
        const endereco = [c.endereco, c.numero].filter(Boolean).join(', ');
        const local = [c.bairro, [c.cidade, c.estado].filter(Boolean).join('/')].filter(Boolean).join(' · ');
        return `
          <article class="rounded-3xl bg-white p-4 shadow-card">
            <h4 class="text-base font-extrabold">${esc(c.nome)}</h4>
            <p class="mt-1 text-sm text-slate-600">${esc(c.cpf ? formatarCpf(c.cpf) : 'CPF não informado')}</p>
            <p class="mt-1 text-sm text-slate-600">${c.telefone ? `<a href="tel:+55${esc(soDigitos(c.telefone))}" class="font-semibold text-brand-800">${esc(formatarTelefone(c.telefone))}</a>` : 'Telefone não informado'}</p>
            <p class="mt-1 text-sm text-slate-600">${esc(endereco || 'Endereço não informado')}</p>
            <p class="text-sm text-slate-500">${esc(local || '')}</p>
            <div class="mt-3 flex flex-wrap gap-2 text-xs font-bold">
              <span class="rounded-full ${c.folha ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'} px-3 py-1">
                Folha: ${c.folha ? 'Sim' : 'Não'}
              </span>
              ${c.folha ? `<span class="rounded-full bg-brand-50 px-3 py-1 text-brand-800">${esc(formatarMoeda(c.valor_mensal))}</span>` : ''}
              ${c.folha && c.banco ? `<span class="rounded-full bg-slate-100 px-3 py-1 text-slate-600">${esc(rotuloBanco(c.banco))}</span>` : ''}
              ${c.folha && c.agencia ? `<span class="rounded-full bg-slate-100 px-3 py-1 text-slate-600">Ag. ${esc(c.agencia)}</span>` : ''}
              ${c.folha && c.conta ? `<span class="rounded-full bg-slate-100 px-3 py-1 text-slate-600">Cc. ${esc(c.conta)}</span>` : ''}
              ${c.folha && c.ultimo_pagamento ? `<span class="rounded-full bg-slate-100 px-3 py-1 text-slate-600">Último pgto ${formatarData(c.ultimo_pagamento)}</span>` : ''}
              ${c.data_inicio ? `<span class="rounded-full bg-slate-100 px-3 py-1 text-slate-600">Desde ${formatarData(c.data_inicio)}</span>` : ''}
            </div>
            ${botoesColaborador(c, false)}
          </article>
        `;
      }).join(''),
      colunas: ['Nome', 'CPF', 'Telefone', 'Cidade', 'Folha', 'Banco', 'Início', 'Ações'],
      linhas: itens.map((c) => {
        const cidade = [c.cidade, c.estado].filter(Boolean).join('/') || '—';
        const banco = c.folha && c.banco
          ? `${rotuloBanco(c.banco)}${c.agencia ? ` · Ag. ${c.agencia}` : ''}${c.conta ? ` · Cc. ${c.conta}` : ''}`
          : '—';
        return `
          <tr>
            <td class="font-semibold text-slate-900">${esc(c.nome)}</td>
            <td>${esc(c.cpf ? formatarCpf(c.cpf) : '—')}</td>
            <td>${c.telefone ? `<a href="tel:+55${esc(soDigitos(c.telefone))}" class="font-semibold text-brand-800">${esc(formatarTelefone(c.telefone))}</a>` : '—'}</td>
            <td>${esc(cidade)}</td>
            <td>${c.folha ? esc(formatarMoeda(c.valor_mensal)) : 'Não'}</td>
            <td>${esc(banco)}</td>
            <td>${c.data_inicio ? formatarData(c.data_inicio) : '—'}</td>
            <td>${botoesColaborador(c, true)}</td>
          </tr>
        `;
      })
    });
  }

  function setOcrStatus(texto) {
    const el = $('pag-ocr-status');
    if (!el) return;
    el.classList.toggle('hidden', !texto);
    el.textContent = texto || '';
  }

  function mostrarPreview(dataUrl) {
    comprovanteAtual = dataUrl || '';
    const wrap = $('pag-preview-wrap');
    const img = $('pag-preview');
    if (!wrap || !img) return;
    wrap.classList.toggle('hidden', !dataUrl);
    img.src = dataUrl || '';
  }

  function resetPagamentoForm() {
    comprovanteAtual = '';
    ocrTexto = '';
    if ($('pag-foto')) $('pag-foto').value = '';
    if ($('pag-arquivo')) $('pag-arquivo').value = '';
    mostrarPreview('');
    setOcrStatus('');
    if ($('pag-data')) $('pag-data').value = hojeISO();
    if ($('pag-valor') && pagamentoColab) {
      $('pag-valor').value = pagamentoColab.valor_mensal ?? '';
    }
  }

  function renderHistorico(lista) {
    const box = $('pag-historico');
    if (!box) return;
    if (!lista?.length) {
      box.innerHTML = '<p class="text-sm text-slate-500">Nenhum pagamento registrado.</p>';
      return;
    }
    box.innerHTML = `<ul class="space-y-2">${lista.map((p) => `
      <li class="flex items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3 py-2">
        <span>
          <strong class="block text-sm text-slate-800">${esc(formatarMoeda(p.valor))}</strong>
          <span class="text-xs text-slate-500">${formatarData(p.data_pagamento)} · ${esc(p.usuario_nome || '')}</span>
        </span>
        <span class="flex shrink-0 gap-2">
          <button type="button" data-pag-ver="${esc(p.id)}" class="rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800">Ver</button>
          <button type="button" data-pag-del="${esc(p.id)}" class="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700">Excluir</button>
        </span>
      </li>
    `).join('')}</ul>`;
  }

  async function carregarHistorico() {
    if (!pagamentoColab) return;
    const lista = await C.api.rpc('listar_pagamentos_folha', { p_colaborador_id: pagamentoColab.id });
    renderHistorico(lista || []);
  }

  async function abrirPagamento(id) {
    const c = (C.state.cache.colaboradores || []).find((x) => x.id === id);
    if (!c || !c.folha) {
      C.ui.toast('Pagamento só está disponível para quem está na folha.', 'erro');
      return;
    }
    pagamentoColab = c;
    $('pag-colaborador-id').value = c.id;
    $('pag-form-titulo').textContent = 'Pagamento da folha';
    $('pag-resumo').textContent = `${c.nome} · ${formatarMoeda(c.valor_mensal)}${c.ultimo_pagamento ? ` · último em ${formatarData(c.ultimo_pagamento)}` : ''}`;
    resetPagamentoForm();
    C.ui.abrirModal('modal-pagamento');
    try {
      C.ui.loading(true);
      await carregarHistorico();
    } catch (err) {
      C.ui.toast(C.utils.msgErro(err), 'erro');
    } finally {
      C.ui.loading(false);
    }
  }

  async function processarComprovante(file) {
    if (!file || !file.type.startsWith('image/')) {
      C.ui.toast('Selecione uma foto do comprovante.', 'erro');
      return;
    }
    setOcrStatus('Lendo comprovante…');
    try {
      const lido = await C.ocr.lerComprovante(file, (p) => {
        setOcrStatus(`Lendo comprovante… ${Math.round((p || 0) * 100)}%`);
      });
      mostrarPreview(lido.dataUrl);
      ocrTexto = lido.texto || '';
      if ($('pag-foto')) $('pag-foto').value = '';
      if ($('pag-arquivo')) $('pag-arquivo').value = '';
      if (lido.data) $('pag-data').value = lido.data;
      if (lido.valor != null) $('pag-valor').value = Number(lido.valor).toFixed(2);
      if (lido.erro) {
        setOcrStatus('Foto anexada. Preencha data e valor se não tiverem sido lidos.');
        return;
      }
      if (lido.data || lido.valor != null) {
        setOcrStatus('Data e valor lidos do comprovante. Confira antes de salvar.');
      } else {
        setOcrStatus('Não deu para ler data/valor. Preencha manualmente.');
      }
    } catch (err) {
      setOcrStatus('');
      C.ui.toast(C.utils.msgErro(err), 'erro');
    }
  }

  C.areas.colaboradores = {
    titulo: 'Colaboradores',
    subtitulo: 'Endereços, CPF, folha e dados bancários',
    chave: 'colaboradores',

    html() {
      return `
        <div id="view-colaboradores" data-view class="hidden space-y-4">
          ${C.ui.barraCrud({
            filtroId: 'filtro-colaboradores',
            placeholder: 'Filtrar por nome, CPF, telefone, cidade ou bairro',
            botaoId: 'btn-novo-colaborador'
          })}
          <div id="lista-colaboradores"></div>
          ${C.ui.modalCadastro({
            id: 'modal-colaborador',
            tituloId: 'col-form-titulo',
            largo: true,
            formHtml: `
              <form id="form-colaborador">
                <input type="hidden" id="col-id" />

                <label class="mb-1 block text-sm font-semibold" for="col-nome">Nome</label>
                <input id="col-nome" class="field mb-3" required />

                <label class="mb-1 block text-sm font-semibold" for="col-cpf">CPF</label>
                <input id="col-cpf" class="field mb-3" inputmode="numeric" autocomplete="off" maxlength="14" placeholder="000.000.000-00" />

                <label class="mb-1 block text-sm font-semibold" for="col-telefone">Telefone</label>
                <input id="col-telefone" class="field mb-3" type="tel" inputmode="tel" autocomplete="tel" maxlength="16" placeholder="(00) 00000-0000" />

                <label class="mb-1 block text-sm font-semibold" for="col-endereco">Endereço</label>
                <input id="col-endereco" class="field mb-3" />

                <div class="mb-3 grid grid-cols-2 gap-3">
                  <div>
                    <label class="mb-1 block text-sm font-semibold" for="col-numero">Número</label>
                    <input id="col-numero" class="field" />
                  </div>
                  <div>
                    <label class="mb-1 block text-sm font-semibold" for="col-complemento">Complemento</label>
                    <input id="col-complemento" class="field" />
                  </div>
                </div>

                <label class="mb-1 block text-sm font-semibold" for="col-bairro">Bairro</label>
                <input id="col-bairro" class="field mb-3" />

                <div class="mb-3 grid grid-cols-3 gap-3">
                  <div>
                    <label class="mb-1 block text-sm font-semibold" for="col-estado">Estado</label>
                    <select id="col-estado" class="field" data-placeholder="Selecione o estado"></select>
                  </div>
                  <div class="col-span-2">
                    <label class="mb-1 block text-sm font-semibold" for="col-cidade">Cidade</label>
                    <select id="col-cidade" class="field" data-placeholder="Selecione a cidade"></select>
                  </div>
                </div>

                <label class="mb-1 block text-sm font-semibold" for="col-inicio">Data de início</label>
                <input id="col-inicio" type="date" class="field mb-4" />

                <div class="mb-3 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                  <div>
                    <p class="text-sm font-bold">Folha</p>
                    <p class="text-xs text-slate-500">Recebe valor mensal?</p>
                  </div>
                  <button type="button" id="col-folha" class="switch" aria-pressed="false" aria-label="Folha">
                    <i></i>
                  </button>
                </div>

                <div id="wrap-folha-dados" class="mb-4 hidden space-y-3">
                  <div>
                    <label class="mb-1 block text-sm font-semibold" for="col-valor">Valor mensal (R$)</label>
                    <input id="col-valor" type="number" min="0" step="0.01" inputmode="decimal" class="field" placeholder="0,00" />
                  </div>
                  <div>
                    <label class="mb-1 block text-sm font-semibold" for="col-banco">Banco</label>
                    <select id="col-banco" class="field" data-placeholder="Selecione o banco"></select>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="mb-1 block text-sm font-semibold" for="col-agencia">Agência</label>
                      <input id="col-agencia" class="field" inputmode="numeric" autocomplete="off" />
                    </div>
                    <div>
                      <label class="mb-1 block text-sm font-semibold" for="col-conta">Conta</label>
                      <input id="col-conta" class="field" inputmode="numeric" autocomplete="off" />
                    </div>
                  </div>
                </div>

                <div class="flex gap-2">
                  <button type="submit" class="btn-primary flex-1">Salvar</button>
                  <button type="button" id="btn-cancelar-colaborador" class="min-h-[52px] flex-1 rounded-2xl bg-slate-100 font-bold text-slate-600">Cancelar</button>
                </div>
              </form>
            `
          })}
          ${C.ui.modalCadastro({
            id: 'modal-pagamento',
            tituloId: 'pag-form-titulo',
            largo: true,
            formHtml: `
              <form id="form-pagamento">
                <input type="hidden" id="pag-colaborador-id" />
                <p id="pag-resumo" class="mb-3 text-sm text-slate-600"></p>

                <p class="mb-2 text-sm font-extrabold text-slate-800">Comprovante</p>
                <div class="mb-3 grid grid-cols-2 gap-2">
                  <button type="button" id="pag-camera" class="min-h-[52px] rounded-2xl bg-brand-800 text-sm font-bold text-white">
                    Tirar foto
                  </button>
                  <button type="button" id="pag-galeria" class="min-h-[52px] rounded-2xl bg-slate-100 text-sm font-bold text-slate-700">
                    Galeria
                  </button>
                </div>
                <input id="pag-foto" type="file" accept="image/*" capture="environment" class="sr-only" tabindex="-1" />
                <input id="pag-arquivo" type="file" accept="image/*" class="sr-only" tabindex="-1" />
                <p id="pag-ocr-status" class="mb-2 hidden text-xs font-semibold text-brand-800"></p>
                <div id="pag-preview-wrap" class="mb-3 hidden overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  <img id="pag-preview" alt="Comprovante" class="max-h-56 w-full object-contain" />
                </div>

                <label class="mb-1 block text-sm font-semibold" for="pag-data">Data do comprovante</label>
                <input id="pag-data" type="date" class="field mb-3" required />

                <label class="mb-1 block text-sm font-semibold" for="pag-valor">Valor (R$)</label>
                <input id="pag-valor" type="number" min="0" step="0.01" inputmode="decimal" class="field mb-4" required />

                <div class="flex gap-2">
                  <button type="submit" id="pag-salvar" class="btn-primary flex-1">Registrar pagamento</button>
                  <button type="button" id="btn-cancelar-pagamento" class="min-h-[52px] flex-1 rounded-2xl bg-slate-100 font-bold text-slate-600">Fechar</button>
                </div>
              </form>
              <div class="mt-5 border-t border-slate-100 pt-4">
                <p class="mb-2 text-sm font-extrabold text-slate-800">Pagamentos anteriores</p>
                <div id="pag-historico"></div>
              </div>
            `
          })}
          ${C.ui.modalCadastro({
            id: 'modal-ver-comprovante',
            tituloId: 'pag-ver-titulo',
            formHtml: `
              <img id="pag-ver-img" alt="Comprovante" class="mb-4 max-h-[70vh] w-full rounded-2xl object-contain bg-slate-50" />
              <button type="button" id="btn-fechar-comprovante" class="btn-primary w-full">Fechar</button>
            `
          })}
        </div>
      `;
    },

    bind() {
      C.localidades.aplicarPadrao($('col-estado'), $('col-cidade'));
      montarBancos();
      setFolha(false);
      $('btn-novo-colaborador').addEventListener('click', () => {
        resetForm();
        C.ui.abrirModal('modal-colaborador');
      });
      $('filtro-colaboradores').addEventListener('input', (ev) => {
        filtro = ev.target.value;
        render();
      });
      $('col-cpf').addEventListener('input', (ev) => {
        ev.target.value = formatarCpf(ev.target.value);
      });
      $('col-telefone').addEventListener('input', (ev) => {
        ev.target.value = formatarTelefone(ev.target.value);
      });
      $('modal-colaborador').addEventListener('cadastro:fechar', resetForm);
      $('col-folha').addEventListener('click', () => setFolha(!folha));
      $('col-estado').addEventListener('change', () => {
        C.localidades.preencherCidades($('col-cidade'), $('col-estado').value);
      });
      $('btn-cancelar-colaborador').addEventListener('click', () => C.ui.fecharModal('modal-colaborador'));
      $('form-colaborador').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const cpf = soDigitos($('col-cpf').value);
        const telefone = soDigitos($('col-telefone').value);
        if (cpf && !cpfValido($('col-cpf').value)) {
          C.ui.toast('Informe um CPF válido.', 'erro');
          return;
        }
        if (telefone && !telefoneValido(telefone)) {
          C.ui.toast('Informe um telefone válido com DDD.', 'erro');
          return;
        }
        if (folha && ($('col-valor').value === '' || Number($('col-valor').value) < 0)) {
          C.ui.toast('Informe o valor mensal da folha.', 'erro');
          return;
        }
        if (folha && !$('col-banco').value) {
          C.ui.toast('Selecione o banco.', 'erro');
          return;
        }
        if (folha && !$('col-agencia').value.trim()) {
          C.ui.toast('Informe a agência.', 'erro');
          return;
        }
        if (folha && !$('col-conta').value.trim()) {
          C.ui.toast('Informe a conta.', 'erro');
          return;
        }
        try {
          C.ui.loading(true);
          await C.api.rpc('salvar_colaborador', {
            p_id: $('col-id').value || null,
            p_nome: $('col-nome').value,
            p_cpf: cpf || null,
            p_telefone: telefone || null,
            p_endereco: $('col-endereco').value,
            p_numero: $('col-numero').value,
            p_complemento: $('col-complemento').value,
            p_bairro: $('col-bairro').value,
            p_cidade: $('col-cidade').value || null,
            p_estado: $('col-estado').value || null,
            p_folha: folha,
            p_valor_mensal: folha ? Number($('col-valor').value) : null,
            p_data_inicio: $('col-inicio').value || null,
            p_banco: folha ? $('col-banco').value : null,
            p_agencia: folha ? $('col-agencia').value : null,
            p_conta: folha ? $('col-conta').value : null
          });
          C.ui.fecharModal('modal-colaborador');
          C.ui.toast('Colaborador salvo.');
          await C.areas.colaboradores.carregar();
        } catch (err) {
          C.ui.toast(C.utils.msgErro(err), 'erro');
        } finally {
          C.ui.loading(false);
        }
      });

      $('pag-camera').addEventListener('click', () => $('pag-foto').click());
      $('pag-galeria').addEventListener('click', () => $('pag-arquivo').click());
      $('pag-foto').addEventListener('change', (ev) => {
        const file = ev.target.files?.[0];
        if (file) processarComprovante(file);
      });
      $('pag-arquivo').addEventListener('change', (ev) => {
        const file = ev.target.files?.[0];
        if (file) processarComprovante(file);
      });
      $('btn-cancelar-pagamento').addEventListener('click', () => C.ui.fecharModal('modal-pagamento'));
      $('btn-fechar-comprovante').addEventListener('click', () => C.ui.fecharModal('modal-ver-comprovante'));
      $('modal-pagamento').addEventListener('cadastro:fechar', () => {
        pagamentoColab = null;
        resetPagamentoForm();
      });

      $('lista-colaboradores').addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-col-acao]');
        if (!btn) return;
        if (btn.dataset.colAcao === 'pagar') abrirPagamento(btn.dataset.id);
      });

      $('form-pagamento').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const colaboradorId = $('pag-colaborador-id').value;
        const data = $('pag-data').value;
        const valor = Number($('pag-valor').value);
        if (!colaboradorId || !data) {
          C.ui.toast('Informe a data do pagamento.', 'erro');
          return;
        }
        if (!Number.isFinite(valor) || valor < 0) {
          C.ui.toast('Informe o valor do pagamento.', 'erro');
          return;
        }
        if (!comprovanteAtual) {
          C.ui.toast('Anexe a foto do comprovante.', 'erro');
          return;
        }
        try {
          C.ui.loading(true);
          await C.api.rpc('salvar_pagamento_folha', {
            p_colaborador_id: colaboradorId,
            p_data_pagamento: data,
            p_valor: valor,
            p_comprovante: comprovanteAtual,
            p_ocr_texto: ocrTexto || null
          });
          C.ui.toast('Pagamento registrado.');
          resetPagamentoForm();
          await carregarHistorico();
          await C.areas.colaboradores.carregar();
          const atual = (C.state.cache.colaboradores || []).find((x) => x.id === colaboradorId);
          if (atual) {
            pagamentoColab = atual;
            $('pag-resumo').textContent = `${atual.nome} · ${formatarMoeda(atual.valor_mensal)}${atual.ultimo_pagamento ? ` · último em ${formatarData(atual.ultimo_pagamento)}` : ''}`;
            $('pag-valor').value = atual.valor_mensal ?? '';
          }
        } catch (err) {
          C.ui.toast(C.utils.msgErro(err), 'erro');
        } finally {
          C.ui.loading(false);
        }
      });

      $('pag-historico').addEventListener('click', async (ev) => {
        const ver = ev.target.closest('[data-pag-ver]');
        const del = ev.target.closest('[data-pag-del]');
        if (ver) {
          try {
            C.ui.loading(true);
            const pag = await C.api.rpc('obter_pagamento_folha', { p_id: ver.dataset.pagVer });
            $('pag-ver-titulo').textContent = `Comprovante · ${formatarData(pag.data_pagamento)}`;
            $('pag-ver-img').src = pag.comprovante || '';
            C.ui.abrirModal('modal-ver-comprovante');
          } catch (err) {
            C.ui.toast(C.utils.msgErro(err), 'erro');
          } finally {
            C.ui.loading(false);
          }
          return;
        }
        if (del) {
          const ok = await C.ui.confirmar('Excluir este pagamento?');
          if (!ok) return;
          try {
            C.ui.loading(true);
            await C.api.rpc('excluir_pagamento_folha', { p_id: del.dataset.pagDel });
            C.ui.toast('Pagamento excluído.');
            await carregarHistorico();
            await C.areas.colaboradores.carregar();
          } catch (err) {
            C.ui.toast(C.utils.msgErro(err), 'erro');
          } finally {
            C.ui.loading(false);
          }
        }
      });
    },

    async carregar() {
      const lista = await C.api.rpc('listar_colaboradores');
      C.state.cache.colaboradores = lista || [];
      await C.localidades.aplicarPadrao($('col-estado'), $('col-cidade'));
      render();
    },

    async editar(id) {
      const c = C.state.cache.colaboradores.find((x) => x.id === id);
      if (!c) return;
      $('col-id').value = c.id;
      $('col-nome').value = c.nome || '';
      $('col-cpf').value = c.cpf ? formatarCpf(c.cpf) : '';
      $('col-telefone').value = c.telefone ? formatarTelefone(c.telefone) : '';
      $('col-endereco').value = c.endereco || '';
      $('col-numero').value = c.numero || '';
      $('col-complemento').value = c.complemento || '';
      $('col-bairro').value = c.bairro || '';
      await C.localidades.preencherEstados($('col-estado'), c.estado || '');
      await C.localidades.preencherCidades($('col-cidade'), c.estado || '', c.cidade || '');
      $('col-inicio').value = c.data_inicio || '';
      setFolha(Boolean(c.folha));
      $('col-valor').value = c.valor_mensal ?? '';
      C.utils.definirSelect($('col-banco'), c.banco ? String(c.banco).padStart(3, '0') : '');
      $('col-agencia').value = c.agencia || '';
      $('col-conta').value = c.conta || '';
      $('col-form-titulo').textContent = 'Editar colaborador';
      C.ui.abrirModal('modal-colaborador');
    },

    excluir(id) {
      return C.api.excluir('excluir_colaborador', id, () => C.areas.colaboradores.carregar());
    }
  };
})(window.Campanha);
