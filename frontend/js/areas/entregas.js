window.Campanha = window.Campanha || {};

(function (C) {
  const $ = (id) => C.utils.$(id);
  const { esc, hojeISO, formatarData, formatarCpf, formatarTelefone, soDigitos, podeGestao, preencherSelect } = C.utils;

  function opcoesMaterial() {
    return (C.state.cache.materiais || []).map((m) => ({
      id: m.id,
      nome: `${m.nome} · ${m.tipo}`
    }));
  }

  function atualizarSelectsCabecalho() {
    const { preencherSelect, preencherSelectMulti } = C.utils;
    preencherSelect($('ent-colaborador'), C.state.cache.colaboradores, {
      value: 'id',
      label: 'nome',
      placeholder: 'Selecione o colaborador'
    });
    preencherSelectMulti($('ent-entregadores'), C.state.cache.equipe, {
      value: 'id',
      label: 'nome',
      selecionados: C.state.usuario?.id ? [C.state.usuario.id] : []
    });
  }

  function atualizarSelectsItens() {
    document.querySelectorAll('#ent-itens .ent-material-item').forEach((sel) => {
      const atual = sel.value;
      preencherSelect(sel, opcoesMaterial(), {
        value: 'id',
        label: 'nome',
        placeholder: 'Selecione o material'
      });
      if (atual) C.utils.definirSelect(sel, atual);
    });
  }

  function destruirChosen(select) {
    const jq = window.jQuery;
    if (!jq || !select) return;
    const $el = jq(select);
    if ($el.data('chosen')) $el.chosen('destroy');
  }

  function adicionarLinha(materialId, quantidade) {
    const wrap = $('ent-itens');
    const row = document.createElement('div');
    row.className = 'ent-item mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3';
    row.innerHTML = `
      <label class="mb-1 block text-sm font-semibold">Material</label>
      <select class="field ent-material-item" required></select>
      <div class="mt-2 flex items-end gap-2">
        <div class="min-w-0 flex-1">
          <label class="mb-1 block text-sm font-semibold">Quantidade</label>
          <input type="number" min="1" step="1" inputmode="numeric" class="field ent-qtd-item" value="${esc(quantidade || 1)}" required />
        </div>
        <button type="button" class="ent-remover-item min-h-[44px] shrink-0 rounded-xl bg-white px-3 text-sm font-bold text-red-700 shadow-sm">
          Remover
        </button>
      </div>
    `;
    wrap.appendChild(row);
    const sel = row.querySelector('.ent-material-item');
    preencherSelect(sel, opcoesMaterial(), {
      value: 'id',
      label: 'nome',
      placeholder: 'Selecione o material'
    });
    if (materialId) C.utils.definirSelect(sel, materialId);
  }

  function garantirUmaLinha() {
    const wrap = $('ent-itens');
    if (!wrap.querySelector('.ent-item')) adicionarLinha();
  }

  function resetarItens(itens) {
    const wrap = $('ent-itens');
    wrap.querySelectorAll('.ent-material-item').forEach(destruirChosen);
    wrap.innerHTML = '';
    const lista = Array.isArray(itens) ? itens.filter((i) => i.material_id) : [];
    if (!lista.length) {
      adicionarLinha();
      return;
    }
    lista.forEach((i) => adicionarLinha(i.material_id, i.quantidade));
  }

  function podeEditar(e) {
    if (statusEntrega(e) === 'entregue') return false;
    return Boolean(e.pode_editar);
  }

  function podeAlterarStatus(e) {
    return Boolean(e.pode_status);
  }

  function idsEntregadores(e) {
    const ids = Array.isArray(e.entregador_ids) ? e.entregador_ids : [];
    if (ids.length) return ids.map(String);
    return e.usuario_id ? [String(e.usuario_id)] : [];
  }

  function colaboradorPorId(id) {
    return (C.state.cache.colaboradores || []).find((c) => c.id === id) || {};
  }

  function telefoneColaborador(fonte) {
    const col = fonte?.colaborador_id ? colaboradorPorId(fonte.colaborador_id) : fonte || {};
    return fonte?.colaborador_telefone || col.telefone || '';
  }

  function htmlTelefone(tel) {
    if (!tel) return '';
    return `<a href="tel:+55${esc(soDigitos(tel))}" class="mt-0.5 block text-xs font-semibold text-brand-800">${esc(formatarTelefone(tel))}</a>`;
  }

  function htmlNomeColaborador(e, extraClass = '') {
    const col = colaboradorPorId(e.colaborador_id);
    const nome = e.colaborador_nome || col.nome || '—';
    return `<div class="min-w-0 ${extraClass}"><p class="font-semibold text-slate-900">${esc(nome)}</p>${htmlTelefone(telefoneColaborador(e))}</div>`;
  }

  function primeiroTexto(...vals) {
    return vals.map((v) => String(v || '').trim()).find(Boolean) || '';
  }

  function dadosEndereco(fonte) {
    if (!fonte) {
      return { endereco: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' };
    }
    const col = fonte.colaborador_id ? colaboradorPorId(fonte.colaborador_id) : {};
    const usaColab = fonte.usa_endereco_colaborador !== false;
    if (usaColab) {
      return {
        endereco: primeiroTexto(col.endereco, fonte.colaborador_endereco, fonte.endereco),
        numero: primeiroTexto(col.numero, fonte.colaborador_numero, fonte.numero),
        complemento: primeiroTexto(col.complemento, fonte.colaborador_complemento, fonte.complemento),
        bairro: primeiroTexto(col.bairro, fonte.colaborador_bairro, fonte.bairro),
        cidade: primeiroTexto(col.cidade, fonte.colaborador_cidade, fonte.cidade),
        estado: primeiroTexto(col.estado, fonte.colaborador_estado, fonte.estado)
      };
    }
    return {
      endereco: primeiroTexto(fonte.endereco),
      numero: primeiroTexto(fonte.numero),
      complemento: primeiroTexto(fonte.complemento),
      bairro: primeiroTexto(fonte.bairro),
      cidade: primeiroTexto(fonte.cidade),
      estado: primeiroTexto(fonte.estado)
    };
  }

  function ruaComNumero(endereco, numero) {
    const rua = String(endereco || '').trim();
    const num = String(numero || '').trim();
    if (!rua) return num;
    if (!num) return rua;
    const ruaNorm = rua.toLowerCase().replace(/\s+/g, ' ').replace(/[.,]$/, '');
    const numNorm = num.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?:^|[,\\s])${numNorm}$`).test(ruaNorm)) return rua;
    return `${rua}, ${num}`;
  }

  function textoEndereco(fonte) {
    const d = dadosEndereco(fonte);
    const rua = [ruaComNumero(d.endereco, d.numero), d.complemento].filter(Boolean).join(', ');
    const local = [d.bairro, [d.cidade, d.estado].filter(Boolean).join('/')].filter(Boolean).join(' · ');
    return [rua, local].filter(Boolean).join(' — ');
  }

  function consultaMaps(fonte) {
    const d = dadosEndereco(fonte);
    const rua = ruaComNumero(d.endereco, d.numero);
    const partes = [rua, d.bairro, d.cidade, d.estado, 'Brasil'].filter(Boolean);
    if (!rua && !d.cidade) return '';
    return partes.join(', ');
  }

  function urlMaps(fonte) {
    const consulta = consultaMaps(fonte);
    if (!consulta) return '';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}`;
  }

  function abrirMaps(fonte) {
    const url = urlMaps(fonte);
    if (!url) {
      C.ui.toast('Endereço insuficiente para abrir o mapa.', 'erro');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function botaoMaps(e, compacto) {
    const url = urlMaps(e);
    if (!url) return '';
    const cls = compacto
      ? 'rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800'
      : 'min-h-[44px] flex-1 rounded-xl bg-sky-50 text-sm font-bold text-sky-800';
    return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="${cls} inline-flex items-center justify-center">Maps</a>`;
  }

  function montarEstadosEntrega(selecionado) {
    const sel = $('ent-estado');
    if (!sel) return Promise.resolve();
    return C.localidades.preencherEstados(sel, selecionado);
  }

  function limparEnderecoNovo() {
    if ($('ent-endereco')) $('ent-endereco').value = '';
    if ($('ent-numero')) $('ent-numero').value = '';
    if ($('ent-complemento')) $('ent-complemento').value = '';
    if ($('ent-bairro')) $('ent-bairro').value = '';
    C.localidades.aplicarPadrao($('ent-estado'), $('ent-cidade'));
  }

  async function preencherEnderecoNovo(fonte) {
    const d = dadosEndereco(fonte);
    if ($('ent-endereco')) $('ent-endereco').value = d.endereco;
    if ($('ent-numero')) $('ent-numero').value = d.numero;
    if ($('ent-complemento')) $('ent-complemento').value = d.complemento;
    if ($('ent-bairro')) $('ent-bairro').value = d.bairro;
    await C.localidades.preencherEstados($('ent-estado'), d.estado);
    await C.localidades.preencherCidades($('ent-cidade'), d.estado, d.cidade);
  }

  function atualizarPreviewColaborador() {
    const col = colaboradorPorId($('ent-colaborador')?.value);
    const tel = $('ent-colab-tel');
    if (tel) {
      if (col.telefone) {
        tel.innerHTML = `<a href="tel:+55${esc(soDigitos(col.telefone))}" class="font-semibold text-brand-800">${esc(formatarTelefone(col.telefone))}</a>`;
        tel.classList.remove('hidden');
      } else {
        tel.innerHTML = '';
        tel.classList.add('hidden');
      }
    }
    atualizarPreviewEndereco();
  }

  function atualizarPreviewEndereco() {
    const preview = $('ent-end-preview');
    if (!preview) return;
    const col = colaboradorPorId($('ent-colaborador')?.value);
    const texto = textoEndereco(col);
    preview.textContent = texto || ($('ent-colaborador')?.value
      ? 'Este colaborador não tem endereço cadastrado.'
      : 'Selecione o colaborador para ver o endereço.');
  }

  function aplicarModoEndereco() {
    const novo = Boolean($('ent-local-novo')?.checked);
    const box = $('ent-end-novo');
    if (box) box.classList.toggle('hidden', !novo);
    if (novo) {
      C.chosen.atualizar($('ent-estado'));
      C.chosen.atualizar($('ent-cidade'));
    }
    atualizarPreviewEndereco();
  }

  function definirModoEndereco(usaColaborador) {
    if ($('ent-local-colab')) $('ent-local-colab').checked = Boolean(usaColaborador);
    if ($('ent-local-novo')) $('ent-local-novo').checked = !usaColaborador;
    aplicarModoEndereco();
  }

  function botoesEditar(e, compacto) {
    if (!podeEditar(e)) return '';
    const cls = compacto
      ? 'rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-800'
      : 'min-h-[44px] flex-1 rounded-xl bg-brand-50 text-sm font-bold text-brand-800';
    return `<button type="button" data-edit="entregas" data-id="${esc(e.id)}" class="${cls}">Editar</button>`;
  }

  function botoesVisualizar(e, compacto) {
    const cls = compacto
      ? 'rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700'
      : 'min-h-[44px] flex-1 rounded-xl bg-slate-100 text-sm font-bold text-slate-700';
    return `<button type="button" data-ent-acao="ver" data-id="${esc(e.id)}" class="${cls}">Visualizar</button>`;
  }

  function acoesEntrega(e, compacto) {
    const status = statusEntrega(e);
    const cls = compacto
      ? 'rounded-lg px-3 py-1.5 text-xs font-bold'
      : 'min-h-[44px] flex-1 rounded-xl text-sm font-bold';
    const confirmar = !podeGestao() && podeAlterarStatus(e) && status !== 'entregue'
      ? `<button type="button" data-ent-acao="entregue" data-id="${esc(e.id)}" class="${cls} bg-emerald-50 text-emerald-800">Confirmar entrega</button>`
      : '';
    const reagendar = !podeGestao() && podeAlterarStatus(e) && status !== 'entregue'
      ? `<button type="button" data-ent-acao="reagendado" data-id="${esc(e.id)}" class="${cls} bg-violet-50 text-violet-800">Reagendar</button>`
      : '';
    const del = podeGestao()
      ? `<button type="button" data-del="entregas" data-id="${esc(e.id)}" class="mt-3 min-h-[44px] w-full rounded-xl bg-red-50 text-sm font-bold text-red-700">Excluir</button>`
      : '';
    const principais = `${botoesEditar(e, false)}${botoesVisualizar(e, false)}${botaoMaps(e, false)}${confirmar}${reagendar}`;
    return `${principais ? `<div class="mt-3 flex gap-2">${principais}</div>` : ''}${del}`;
  }

  function menuAcoesGrid(e) {
    const maps = urlMaps(e);
    const editar = podeEditar(e)
      ? C.ui.itemMenu({ rotulo: 'Editar', icone: 'editar', attrs: `data-edit="entregas" data-id="${esc(e.id)}"` })
      : C.ui.itemMenu({ rotulo: 'Editar', icone: 'editar', desativado: true });
    const visualizar = C.ui.itemMenu({ rotulo: 'Visualizar', icone: 'visualizar', attrs: `data-ent-acao="ver" data-id="${esc(e.id)}"` });
    const mapa = maps
      ? C.ui.itemMenu({ rotulo: 'Mapa', icone: 'mapa', attrs: `data-ent-acao="mapa" data-id="${esc(e.id)}"` })
      : C.ui.itemMenu({ rotulo: 'Mapa', icone: 'mapa', desativado: true });
    const excluir = podeGestao()
      ? C.ui.itemMenu({ rotulo: 'Excluir', icone: 'excluir', attrs: `data-del="entregas" data-id="${esc(e.id)}"`, perigo: true })
      : C.ui.itemMenu({ rotulo: 'Excluir', icone: 'excluir', desativado: true });
    return C.ui.menuAcoes(e.id, `${editar}${visualizar}${mapa}${excluir}`);
  }

  function linhaDado(rotulo, valor) {
    return `
      <div class="mb-3">
        <p class="text-xs font-bold uppercase tracking-wide text-slate-500">${esc(rotulo)}</p>
        <div class="mt-0.5 text-sm font-semibold text-slate-800">${valor || '—'}</div>
      </div>
    `;
  }

  function htmlVisualizacao(e) {
    const itens = itensDaEntrega(e);
    const col = colaboradorPorId(e.colaborador_id);
    const maps = urlMaps(e);
    const localEntrega = textoEndereco(e) || 'Não informado';
    const origem = e.usa_endereco_colaborador === false ? 'Endereço cadastrado para esta entrega' : 'Endereço do colaborador';
    const listaItens = itens.length
      ? `<ul class="space-y-2">${itens.map((i) => `
          <li class="flex items-start justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2">
            <span>
              <strong class="text-slate-800">${esc(i.material_nome || '—')}</strong>
              <span class="block text-xs text-slate-500">${esc(i.material_tipo || '')}</span>
            </span>
            <strong class="text-slate-800">${esc(i.quantidade ?? '—')}</strong>
          </li>`).join('')}</ul>`
      : '<p class="text-sm text-slate-500">Nenhum material.</p>';
    return `
      <div class="mb-3">${badgeStatus(statusEntrega(e))}</div>
      ${linhaDado('Data', formatarData(e.data_entrega))}
      ${linhaDado('Colaborador', htmlNomeColaborador(e))}
      ${col.cpf ? linhaDado('CPF', esc(formatarCpf(col.cpf))) : ''}
      ${linhaDado(origem, esc(localEntrega))}
      ${maps ? `<a href="${esc(maps)}" target="_blank" rel="noopener noreferrer" class="mb-3 inline-flex min-h-[44px] items-center rounded-xl bg-sky-50 px-4 text-sm font-bold text-sky-800">Abrir no Maps</a>` : ''}
      ${linhaDado('Quem recebeu', esc(e.quem_recebeu || '—'))}
      ${linhaDado('Entregue por', esc(nomesEntregadores(e)))}
      <p class="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Materiais</p>
      ${listaItens}
      ${e.observacoes ? `<div class="mt-3">
        <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Observações</p>
        <p class="mt-0.5 whitespace-pre-wrap text-sm font-semibold text-slate-800">${esc(e.observacoes)}</p>
      </div>` : ''}
    `;
  }

  function abrirVisualizacao(id) {
    const e = (C.state.cache.entregas || []).find((x) => x.id === id);
    if (!e) return;
    $('ent-ver-titulo').textContent = 'Detalhes da entrega';
    $('ent-ver-corpo').innerHTML = htmlVisualizacao(e);
    C.ui.abrirModal('modal-ver-entrega');
  }

  function coletarItens() {
    return Array.from(document.querySelectorAll('#ent-itens .ent-item')).map((row) => ({
      material_id: row.querySelector('.ent-material-item')?.value || '',
      quantidade: Number(row.querySelector('.ent-qtd-item')?.value)
    }));
  }

  function itensDaEntrega(e) {
    if (Array.isArray(e.itens) && e.itens.length) return e.itens;
    if (e.material_nome) {
      return [{
        material_nome: e.material_nome,
        material_tipo: e.material_tipo,
        quantidade: e.quantidade
      }];
    }
    return [];
  }

  function nomesEntregadores(e) {
    return e.entregadores_nomes || e.usuario_nome || '—';
  }

  function statusEntrega(registro) {
    return (registro && registro.status) ? registro.status : 'novo';
  }

  function resetarStatusForm() {
    const el = $('ent-status');
    if (!el) return;
    el.innerHTML = opcoesStatusHtml('novo');
    el.value = 'novo';
  }

  function prepararFormNovo() {
    aplicarCamposAdmin();
    atualizarSelectsCabecalho();
    resetarStatusForm();
    if ($('ent-id')) $('ent-id').value = '';
    if ($('ent-recebeu')) $('ent-recebeu').value = '';
    if ($('ent-obs')) $('ent-obs').value = '';
    if ($('ent-data')) $('ent-data').value = hojeISO();
    if ($('ent-salvar')) $('ent-salvar').textContent = 'Registrar entrega';
    resetarItens();
    limparEnderecoNovo();
    definirModoEndereco(true);
    atualizarPreviewColaborador();
    if ($('ent-form-titulo')) $('ent-form-titulo').textContent = 'Nova entrega';
  }

  function aplicarCamposAdmin() {
    const admin = podeGestao();
    document.querySelectorAll('#modal-entrega .ent-admin-only').forEach((el) => {
      el.classList.toggle('hidden', !admin);
    });
  }

  async function recarregarLista() {
    const lista = await C.api.rpc('listar_entregas', { p_limite: 10000 });
    C.state.cache.entregas = lista || [];
    render();
  }

  async function mudarStatus(id, status, data) {
    const params = { p_id: id, p_status: status };
    if (data) params.p_data_entrega = data;
    await C.api.rpc('atualizar_status_entrega', params);
    await recarregarLista();
  }

  function opcoesStatusHtml(atual) {
    return C.utils.STATUS_ENTREGA.map((s) => (
      `<option value="${esc(s.id)}"${s.id === atual ? ' selected' : ''}>${esc(s.nome)}</option>`
    )).join('');
  }

  function badgeStatus(status) {
    return `<span class="badge-status ${C.utils.classeStatus(status)}"><i class="status-dot" aria-hidden="true"></i>${esc(C.utils.rotuloStatus(status))}</span>`;
  }

  function controleStatus(e) {
    const status = statusEntrega(e);
    if (podeGestao() && podeAlterarStatus(e)) {
      return `<select class="field no-chosen ent-status-sel ${C.utils.classeStatus(status)}" data-id="${esc(e.id)}" aria-label="Status da entrega">${opcoesStatusHtml(status)}</select>`;
    }
    return badgeStatus(status);
  }

  let filtroStatus = '';
  let filtroTexto = '';

  function pintarChips() {
    const box = $('ent-filtro-status');
    if (!box) return;
    const chip = (id, label) => {
      const ativo = filtroStatus === id;
      const cor = id ? `chip-status-${id}` : 'chip-status-todos';
      const dot = id ? '<i class="status-dot" aria-hidden="true"></i>' : '';
      return `<button type="button" data-status="${esc(id)}"
        class="chip-status ${cor}${ativo ? ' is-on' : ''}">${dot}${esc(label)}</button>`;
    };
    box.innerHTML = [
      chip('', 'Todos'),
      ...C.utils.STATUS_ENTREGA.map((s) => chip(s.id, s.nome))
    ].join('');
  }

  function entregasVisiveis() {
    let lista = C.state.cache.entregas || [];
    if (filtroStatus) lista = lista.filter((e) => statusEntrega(e) === filtroStatus);
    if (filtroTexto) {
      lista = lista.filter((e) => {
        const itens = itensDaEntrega(e);
        return C.utils.matchFiltro(
          filtroTexto,
          e.colaborador_nome,
          telefoneColaborador(e),
          formatarTelefone(telefoneColaborador(e)),
          e.quem_recebeu,
          e.observacoes,
          nomesEntregadores(e),
          resumoMateriais(itens),
          C.utils.rotuloStatus(statusEntrega(e)),
          e.endereco,
          e.bairro,
          e.cidade
        );
      });
    }
    return lista;
  }

  function rotuloTipo(itens) {
    const tipos = [...new Set(itens.map((i) => i.material_tipo).filter(Boolean))];
    if (!tipos.length) return 'Materiais';
    if (tipos.length === 1) return tipos[0];
    return `${tipos.length} tipos`;
  }

  function resumoMateriais(itens) {
    return itens.map((i) => i.material_nome).filter(Boolean).join(', ') || '—';
  }

  function render() {
    const box = $('lista-entregas');
    const lista = entregasVisiveis();
    if (!lista.length) {
      box.innerHTML = C.ui.vazio(
        filtroTexto || filtroStatus ? 'Nenhuma entrega encontrada.' : 'Nenhuma entrega registrada ainda.'
      );
      return;
    }
    box.innerHTML = C.ui.listaDupla({
      vazioTexto: 'Nenhuma entrega registrada ainda.',
      cards: lista.map((e) => {
        const itens = itensDaEntrega(e);
        const status = statusEntrega(e);
        return `
        <article class="rounded-3xl bg-white p-4 shadow-card status-faixa-${esc(status)}">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-[11px] font-bold uppercase tracking-wide text-brand-700">${esc(rotuloTipo(itens))}</p>
              <h4 class="text-base font-extrabold text-slate-900">${esc(itens.length === 1 ? itens[0].material_nome : `${itens.length} materiais`)}</h4>
              ${htmlNomeColaborador(e, 'mt-1')}
            </div>
            ${badgeStatus(status)}
          </div>
          <ul class="mt-3 space-y-1 text-sm text-slate-700">
            ${itens.map((i) => `<li>${esc(i.material_nome)}</li>`).join('')}
          </ul>
          ${e.observacoes ? `<p class="mt-2 whitespace-pre-wrap text-sm text-slate-600">${esc(e.observacoes)}</p>` : ''}
          <div class="mt-3 grid grid-cols-1 gap-1 text-sm text-slate-600">
            <p>Entregue por: <strong class="text-slate-800">${esc(nomesEntregadores(e))}</strong></p>
            <p>${formatarData(e.data_entrega)}${e.bairro || e.colaborador_bairro ? ` · ${esc(e.bairro || e.colaborador_bairro)}` : ''}${e.cidade || e.colaborador_cidade ? `/${esc(e.cidade || e.colaborador_cidade)}` : ''}</p>
          </div>
          ${podeGestao() && podeAlterarStatus(e) ? `<div class="mt-3">${controleStatus(e)}</div>` : ''}
          ${acoesEntrega(e, false)}
        </article>
      `;
      }).join(''),
      colunas: ['Data', 'Status', 'Materiais', 'Colaborador', 'Entregue por', 'Ações'],
      linhas: lista.map((e) => {
        const itens = itensDaEntrega(e);
        const status = statusEntrega(e);
        return `
        <tr class="status-faixa-${esc(status)}">
          <td>${formatarData(e.data_entrega)}</td>
          <td>${controleStatus(e)}</td>
          <td>
            <p class="font-semibold text-slate-900">${esc(resumoMateriais(itens))}</p>
            ${e.observacoes ? `<p class="mt-1 line-clamp-2 whitespace-pre-wrap text-xs font-medium text-slate-500">${esc(e.observacoes)}</p>` : ''}
          </td>
          <td>${htmlNomeColaborador(e)}</td>
          <td>${esc(nomesEntregadores(e))}</td>
          <td class="ent-acoes">${menuAcoesGrid(e)}</td>
        </tr>
      `;
      })
    });
  }

  C.areas.entregas = {
    titulo: 'Entregas',
    subtitulo: 'Registro de saída de materiais',
    chave: 'entregas',

    html() {
      return `
        <div id="view-entregas" data-view class="hidden space-y-4">
          ${C.ui.barraCrud({
            filtroId: 'filtro-entregas',
            placeholder: 'Filtrar por colaborador, material, quem recebeu ou observações',
            botaoId: 'btn-nova-entrega',
            rotulo: 'Cadastrar'
          })}
          <div id="ent-filtro-status" class="flex flex-wrap gap-2"></div>
          <div id="lista-entregas"></div>
          ${C.ui.modalCadastro({
            id: 'modal-entrega',
            tituloId: 'ent-form-titulo',
            largo: true,
            formHtml: `
              <form id="form-entrega">
                <input type="hidden" id="ent-id" />
                <label class="mb-1 block text-sm font-semibold" for="ent-colaborador">Colaborador</label>
                <select id="ent-colaborador" class="field mb-1" required></select>
                <p id="ent-colab-tel" class="mb-3 hidden text-sm"></p>

                <p class="mb-1 text-sm font-semibold">Local da entrega</p>
                <div class="mb-3 grid gap-2">
                  <label class="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                    <input type="radio" name="ent-local" id="ent-local-colab" value="colab" class="mt-1" checked />
                    <span>
                      <strong class="block text-sm text-slate-800">Usar endereço do colaborador</strong>
                      <span id="ent-end-preview" class="mt-0.5 block text-xs text-slate-500">Selecione o colaborador para ver o endereço.</span>
                    </span>
                  </label>
                  <label class="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                    <input type="radio" name="ent-local" id="ent-local-novo" value="novo" class="mt-1" />
                    <span>
                      <strong class="block text-sm text-slate-800">Cadastrar novo endereço</strong>
                      <span class="mt-0.5 block text-xs text-slate-500">Informe o local específico desta entrega.</span>
                    </span>
                  </label>
                </div>

                <div id="ent-end-novo" class="mb-3 hidden rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <label class="mb-1 block text-sm font-semibold" for="ent-endereco">Endereço</label>
                  <input id="ent-endereco" class="field mb-3" placeholder="Rua, avenida..." />
                  <div class="mb-3 grid grid-cols-2 gap-2">
                    <div>
                      <label class="mb-1 block text-sm font-semibold" for="ent-numero">Número</label>
                      <input id="ent-numero" class="field" />
                    </div>
                    <div>
                      <label class="mb-1 block text-sm font-semibold" for="ent-complemento">Complemento</label>
                      <input id="ent-complemento" class="field" />
                    </div>
                  </div>
                  <label class="mb-1 block text-sm font-semibold" for="ent-bairro">Bairro</label>
                  <input id="ent-bairro" class="field mb-3" />
                  <div class="grid grid-cols-3 gap-2">
                    <div>
                      <label class="mb-1 block text-sm font-semibold" for="ent-estado">Estado</label>
                      <select id="ent-estado" class="field" data-placeholder="UF"></select>
                    </div>
                    <div class="col-span-2">
                      <label class="mb-1 block text-sm font-semibold" for="ent-cidade">Cidade</label>
                      <select id="ent-cidade" class="field" data-placeholder="Selecione a cidade"></select>
                    </div>
                  </div>
                </div>

                <div class="ent-admin-only">
                  <label class="mb-1 block text-sm font-semibold" for="ent-entregadores">Quem entregou</label>
                  <select id="ent-entregadores" class="field mb-3" multiple data-placeholder="Selecione quem entregou"></select>
                </div>

                <label class="mb-1 block text-sm font-semibold" for="ent-recebeu">Quem recebeu <span class="font-medium text-slate-400">(opcional)</span></label>
                <input id="ent-recebeu" class="field mb-3" placeholder="Nome de quem recebeu" />

                <label class="mb-1 block text-sm font-semibold" for="ent-data">Data</label>
                <input id="ent-data" type="date" class="field mb-3" required />

                <div class="ent-admin-only">
                  <label class="mb-1 block text-sm font-semibold" for="ent-status">Status</label>
                  <select id="ent-status" class="field no-chosen mb-4" required>
                    <option value="novo" selected>Novo</option>
                  </select>
                </div>

                <div class="mb-2 flex items-center justify-between gap-3">
                  <p class="text-sm font-extrabold text-slate-800">Materiais</p>
                  <button type="button" id="ent-add-item" class="text-sm font-bold text-brand-800">+ Adicionar material</button>
                </div>
                <div id="ent-itens"></div>

                <label class="mb-1 mt-3 block text-sm font-semibold" for="ent-obs">Observações <span class="font-medium text-slate-400">(opcional)</span></label>
                <textarea id="ent-obs" class="field mb-3 min-h-[88px] resize-y" maxlength="2000" rows="3" placeholder="Anotações desta entrega"></textarea>

                <div class="mt-3 flex gap-2">
                  <button type="submit" id="ent-salvar" class="btn-primary flex-1">Registrar entrega</button>
                  <button type="button" id="btn-cancelar-entrega" class="min-h-[52px] flex-1 rounded-2xl bg-slate-100 font-bold text-slate-600">Cancelar</button>
                </div>
              </form>
            `
          })}
          ${C.ui.modalCadastro({
            id: 'modal-ver-entrega',
            tituloId: 'ent-ver-titulo',
            largo: true,
            formHtml: `
              <div id="ent-ver-corpo" class="mb-4"></div>
              <button type="button" id="btn-fechar-ver-entrega" class="btn-primary w-full">Fechar</button>
            `
          })}
          ${C.ui.modalCadastro({
            id: 'modal-reagendar',
            tituloId: 'reag-form-titulo',
            formHtml: `
              <form id="form-reagendar">
                <input type="hidden" id="reag-id" />
                <p class="mb-3 text-sm text-slate-600">Escolha a nova data da entrega.</p>
                <label class="mb-1 block text-sm font-semibold" for="reag-data">Nova data</label>
                <input id="reag-data" type="date" class="field mb-4" required />
                <div class="flex gap-2">
                  <button type="submit" class="btn-primary flex-1">Reagendar</button>
                  <button type="button" id="btn-cancelar-reagendar" class="min-h-[52px] flex-1 rounded-2xl bg-slate-100 font-bold text-slate-600">Cancelar</button>
                </div>
              </form>
            `
          })}
        </div>
      `;
    },

    bind() {
      $('btn-nova-entrega').addEventListener('click', () => {
        prepararFormNovo();
        C.ui.abrirModal('modal-entrega');
      });
      $('filtro-entregas').addEventListener('input', (ev) => {
        filtroTexto = ev.target.value;
        render();
      });
      $('btn-cancelar-entrega').addEventListener('click', () => C.ui.fecharModal('modal-entrega'));
      $('btn-fechar-ver-entrega').addEventListener('click', () => C.ui.fecharModal('modal-ver-entrega'));
      $('modal-entrega').addEventListener('cadastro:fechar', prepararFormNovo);

      $('ent-add-item').addEventListener('click', () => adicionarLinha());

      $('ent-colaborador').addEventListener('change', atualizarPreviewColaborador);
      $('ent-local-colab').addEventListener('change', aplicarModoEndereco);
      $('ent-local-novo').addEventListener('change', aplicarModoEndereco);
      $('ent-estado').addEventListener('change', () => {
        C.localidades.preencherCidades($('ent-cidade'), $('ent-estado').value);
      });
      montarEstadosEntrega();

      $('ent-itens').addEventListener('click', (ev) => {
        const btn = ev.target.closest('.ent-remover-item');
        if (!btn) return;
        const wrap = $('ent-itens');
        if (wrap.querySelectorAll('.ent-item').length <= 1) {
          C.ui.toast('A entrega precisa de ao menos um material.', 'erro');
          return;
        }
        const row = btn.closest('.ent-item');
        destruirChosen(row.querySelector('.ent-material-item'));
        row.remove();
      });

      $('form-entrega').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const colaboradorId = $('ent-colaborador').value;
        const recebeu = $('ent-recebeu').value.trim();
        const observacoes = ($('ent-obs')?.value || '').trim();
        const entregadores = podeGestao()
          ? C.utils.valoresSelect($('ent-entregadores'))
          : (C.state.usuario?.id ? [C.state.usuario.id] : []);
        const data = $('ent-data').value;
        const itens = coletarItens();
        if (!colaboradorId || !entregadores.length) {
          C.ui.toast(podeGestao() ? 'Preencha colaborador e quem entregou.' : 'Selecione o colaborador.', 'erro');
          return;
        }
        if (!itens.length || itens.some((i) => !i.material_id || !i.quantidade)) {
          C.ui.toast('Inclua ao menos um material com quantidade.', 'erro');
          return;
        }
        const usaColab = Boolean($('ent-local-colab')?.checked);
        const enderecoNovo = {
          endereco: $('ent-endereco')?.value.trim() || '',
          numero: $('ent-numero')?.value.trim() || '',
          complemento: $('ent-complemento')?.value.trim() || '',
          bairro: $('ent-bairro')?.value.trim() || '',
          cidade: $('ent-cidade')?.value.trim() || '',
          estado: $('ent-estado')?.value || ''
        };
        if (!usaColab && !enderecoNovo.endereco && !enderecoNovo.cidade) {
          C.ui.toast('Informe o endereço da entrega.', 'erro');
          return;
        }
        try {
          C.ui.loading(true);
          const id = $('ent-id').value || null;
          await C.api.rpc('salvar_entrega', {
            p_id: id,
            p_colaborador_id: colaboradorId,
            p_quem_recebeu: recebeu,
            p_data_entrega: data,
            p_entregadores: entregadores,
            p_itens: itens,
            p_status: podeGestao() ? ($('ent-status').value || 'novo') : 'novo',
            p_usa_endereco_colaborador: usaColab,
            p_endereco: usaColab ? null : enderecoNovo.endereco,
            p_numero: usaColab ? null : enderecoNovo.numero,
            p_complemento: usaColab ? null : enderecoNovo.complemento,
            p_bairro: usaColab ? null : enderecoNovo.bairro,
            p_cidade: usaColab ? null : enderecoNovo.cidade,
            p_estado: usaColab ? null : enderecoNovo.estado,
            p_observacoes: observacoes || null
          });
          C.ui.fecharModal('modal-entrega');
          C.ui.toast(id ? 'Entrega atualizada.' : 'Entrega registrada.');
          await C.areas.entregas.carregar();
        } catch (err) {
          C.ui.toast(C.utils.msgErro(err), 'erro');
        } finally {
          C.ui.loading(false);
        }
      });

      $('lista-entregas').addEventListener('click', async (ev) => {
        const btn = ev.target.closest('[data-ent-acao]');
        if (!btn) return;
        const id = btn.dataset.id;
        const acao = btn.dataset.entAcao;
        if (acao === 'mapa') {
          const atual = (C.state.cache.entregas || []).find((x) => x.id === id);
          abrirMaps(atual);
          return;
        }
        if (acao === 'ver') {
          abrirVisualizacao(id);
          return;
        }
        if (acao === 'reagendado') {
          const atual = (C.state.cache.entregas || []).find((x) => x.id === id);
          if (!podeAlterarStatus(atual)) {
            C.ui.toast('Somente quem está em Quem entregou pode alterar o status.', 'erro');
            return;
          }
          $('reag-id').value = id;
          $('reag-data').value = atual?.data_entrega || hojeISO();
          $('reag-form-titulo').textContent = 'Reagendar entrega';
          C.ui.abrirModal('modal-reagendar');
          return;
        }
        if (acao === 'entregue') {
          const atual = (C.state.cache.entregas || []).find((x) => x.id === id);
          if (!podeAlterarStatus(atual)) {
            C.ui.toast('Somente quem está em Quem entregou pode alterar o status.', 'erro');
            return;
          }
          const ok = await C.ui.confirmar('Confirmar que esta entrega foi realizada?', { rotulo: 'Confirmar', perigo: false });
          if (!ok) return;
          try {
            C.ui.loading(true);
            await mudarStatus(id, 'entregue');
            C.ui.toast('Entrega confirmada.');
          } catch (err) {
            C.ui.toast(C.utils.msgErro(err), 'erro');
          } finally {
            C.ui.loading(false);
          }
        }
      });

      $('btn-cancelar-reagendar').addEventListener('click', () => C.ui.fecharModal('modal-reagendar'));
      $('form-reagendar').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const id = $('reag-id').value;
        const data = $('reag-data').value;
        if (!id || !data) return;
        try {
          C.ui.loading(true);
          await mudarStatus(id, 'reagendado', data);
          C.ui.fecharModal('modal-reagendar');
          C.ui.toast('Entrega reagendada.');
        } catch (err) {
          C.ui.toast(C.utils.msgErro(err), 'erro');
        } finally {
          C.ui.loading(false);
        }
      });

      $('lista-entregas').addEventListener('change', async (ev) => {
        const sel = ev.target.closest('.ent-status-sel');
        if (!sel) return;
        try {
          C.ui.loading(true);
          await C.api.rpc('atualizar_status_entrega', {
            p_id: sel.dataset.id,
            p_status: sel.value
          });
          C.ui.toast('Status atualizado.');
          await recarregarLista();
        } catch (err) {
          C.ui.toast(C.utils.msgErro(err), 'erro');
          render();
        } finally {
          C.ui.loading(false);
        }
      });

      $('ent-filtro-status').addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-status]');
        if (!btn) return;
        filtroStatus = btn.dataset.status || '';
        pintarChips();
        render();
      });

    },

    async carregar() {
      const admin = podeGestao();
      $('titulo-view').textContent = 'Entregas';
      const sub = $('subtitulo-view');
      if (sub) {
        sub.textContent = admin
          ? 'Registro de saída de materiais'
          : 'Todos veem as entregas; alterar só quem está em Quem entregou';
      }
      aplicarCamposAdmin();
      await C.api.listasBase();
      atualizarSelectsCabecalho();
      if (!$('ent-data').value) $('ent-data').value = hojeISO();
      await recarregarLista();
      pintarChips();
    },

    async editar(id) {
      const e = (C.state.cache.entregas || []).find((x) => x.id === id);
      if (!e) return;
      if (statusEntrega(e) === 'entregue') {
        C.ui.toast('Entrega concluída não pode ser editada.', 'erro');
        return;
      }
      if (!podeEditar(e)) {
        C.ui.toast('Somente quem está em Quem entregou pode alterar esta entrega.', 'erro');
        return;
      }
      aplicarCamposAdmin();
      atualizarSelectsCabecalho();
      $('ent-id').value = e.id;
      C.utils.definirSelect($('ent-colaborador'), e.colaborador_id || '');
      const { preencherSelectMulti } = C.utils;
      preencherSelectMulti($('ent-entregadores'), C.state.cache.equipe, {
        value: 'id',
        label: 'nome',
        selecionados: idsEntregadores(e)
      });
      $('ent-recebeu').value = e.quem_recebeu || '';
      if ($('ent-obs')) $('ent-obs').value = e.observacoes || '';
      $('ent-data').value = e.data_entrega || hojeISO();
      const status = statusEntrega(e);
      if ($('ent-status')) {
        $('ent-status').innerHTML = opcoesStatusHtml(status);
        $('ent-status').value = status;
      }
      resetarItens(itensDaEntrega(e));
      if (e.usa_endereco_colaborador === false) {
        await preencherEnderecoNovo(e);
        definirModoEndereco(false);
      } else {
        await montarEstadosEntrega();
        limparEnderecoNovo();
        definirModoEndereco(true);
      }
      atualizarPreviewColaborador();
      $('ent-salvar').textContent = 'Salvar';
      $('ent-form-titulo').textContent = 'Editar entrega';
      C.ui.abrirModal('modal-entrega');
    },

    excluir(id) {
      if (!podeGestao()) {
        C.ui.toast('Somente administrador ou usuário geral pode excluir entregas.', 'erro');
        return;
      }
      return C.api.excluir('excluir_entrega', id, () => C.areas.entregas.carregar());
    }
  };
})(window.Campanha);
