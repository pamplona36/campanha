window.Campanha = window.Campanha || {};

(function (C) {
  const $ = (id) => C.utils.$(id);
  const { esc, formatarData, formatarMoeda, formatarCpf, cpfValido, soDigitos, rotuloBanco, matchFiltro } = C.utils;
  const ESTADOS = [
    '', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
    'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
    'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  ];

  let folha = false;
  let filtro = '';

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
    C.chosen.atualizar($('col-estado'));
    C.chosen.atualizar($('col-banco'));
  }

  function montarEstados() {
    $('col-estado').innerHTML = ESTADOS.map((uf) =>
      `<option value="${esc(uf)}">${uf ? uf : 'UF'}</option>`
    ).join('');
    C.chosen.atualizar($('col-estado'));
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
              ${c.data_inicio ? `<span class="rounded-full bg-slate-100 px-3 py-1 text-slate-600">Desde ${formatarData(c.data_inicio)}</span>` : ''}
            </div>
            ${C.ui.botoesCard(c.id, 'colaboradores')}
          </article>
        `;
      }).join(''),
      colunas: ['Nome', 'CPF', 'Cidade', 'Folha', 'Banco', 'Início', 'Ações'],
      linhas: itens.map((c) => {
        const cidade = [c.cidade, c.estado].filter(Boolean).join('/') || '—';
        const banco = c.folha && c.banco
          ? `${rotuloBanco(c.banco)}${c.agencia ? ` · Ag. ${c.agencia}` : ''}${c.conta ? ` · Cc. ${c.conta}` : ''}`
          : '—';
        return `
          <tr>
            <td class="font-semibold text-slate-900">${esc(c.nome)}</td>
            <td>${esc(c.cpf ? formatarCpf(c.cpf) : '—')}</td>
            <td>${esc(cidade)}</td>
            <td>${c.folha ? esc(formatarMoeda(c.valor_mensal)) : 'Não'}</td>
            <td>${esc(banco)}</td>
            <td>${c.data_inicio ? formatarData(c.data_inicio) : '—'}</td>
            <td>${C.ui.botoesLinha(c.id, 'colaboradores')}</td>
          </tr>
        `;
      })
    });
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
            placeholder: 'Filtrar por nome, CPF, cidade ou bairro',
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
                  <div class="col-span-2">
                    <label class="mb-1 block text-sm font-semibold" for="col-cidade">Cidade</label>
                    <input id="col-cidade" class="field" />
                  </div>
                  <div>
                    <label class="mb-1 block text-sm font-semibold" for="col-estado">Estado</label>
                    <select id="col-estado" class="field"></select>
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
        </div>
      `;
    },

    bind() {
      montarEstados();
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
      $('modal-colaborador').addEventListener('cadastro:fechar', resetForm);
      $('col-folha').addEventListener('click', () => setFolha(!folha));
      $('btn-cancelar-colaborador').addEventListener('click', () => C.ui.fecharModal('modal-colaborador'));
      $('form-colaborador').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const cpf = soDigitos($('col-cpf').value);
        if (cpf && !cpfValido($('col-cpf').value)) {
          C.ui.toast('Informe um CPF válido.', 'erro');
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
            p_endereco: $('col-endereco').value,
            p_numero: $('col-numero').value,
            p_complemento: $('col-complemento').value,
            p_bairro: $('col-bairro').value,
            p_cidade: $('col-cidade').value,
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
    },

    async carregar() {
      const lista = await C.api.rpc('listar_colaboradores');
      C.state.cache.colaboradores = lista || [];
      render();
    },

    editar(id) {
      const c = C.state.cache.colaboradores.find((x) => x.id === id);
      if (!c) return;
      $('col-id').value = c.id;
      $('col-nome').value = c.nome || '';
      $('col-cpf').value = c.cpf ? formatarCpf(c.cpf) : '';
      $('col-endereco').value = c.endereco || '';
      $('col-numero').value = c.numero || '';
      $('col-complemento').value = c.complemento || '';
      $('col-bairro').value = c.bairro || '';
      $('col-cidade').value = c.cidade || '';
      C.utils.definirSelect($('col-estado'), c.estado || '');
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
