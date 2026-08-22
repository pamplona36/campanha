window.Campanha = window.Campanha || {};

(function (C) {
  const $ = (id) => C.utils.$(id);

  function iconBox() {
    return `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>`;
  }
  function iconChart() {
    return `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3v18h18M7 15v3m5-8v8m5-12v12"/></svg>`;
  }
  function iconGrid() {
    return `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h6v6H4zM14 6h6v6h-6zM4 16h6v6H4zM14 16h6v6h-6z"/></svg>`;
  }
  function iconUsers() {
    return `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>`;
  }
  function iconPin() {
    return `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21s7-5.4 7-11a7 7 0 10-14 0c0 5.6 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>`;
  }
  function iconFlag() {
    return `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1v18"/></svg>`;
  }
  function iconTag() {
    return `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M3 11l8.5-8.5a2 2 0 012.8 0L21 9.2a2 2 0 010 2.8L12.2 21a2 2 0 01-2.8 0L3 14.6V11z"/></svg>`;
  }

  function iconMoney() {
    return `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
  }

  const CADASTROS = ['usuarios', 'colaboradores', 'materiais', 'tipos'];
  const ORDEM = ['entregas', 'relatorios', 'folha', 'usuarios', 'colaboradores', 'materiais', 'tipos'];

  function menu() {
    const admin = C.utils.isAdmin();
    const operacao = [{ id: 'entregas', label: 'Entregas', svg: iconBox() }];
    if (admin) {
      operacao.push({ id: 'relatorios', label: 'Relatórios', svg: iconChart() });
    }
    const cadastros = admin
      ? [
          { id: 'usuarios', label: 'Usuários', svg: iconUsers() },
          { id: 'colaboradores', label: 'Colaboradores', svg: iconPin() },
          { id: 'materiais', label: 'Materiais', svg: iconFlag() },
          { id: 'tipos', label: 'Tipos', svg: iconTag() }
        ]
      : [];
    return { admin, operacao, cadastros };
  }

  function btnLateral(item) {
    const ativo = C.state.view === item.id;
    return `
      <button type="button" data-nav="${item.id}"
        class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${ativo ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}">
        ${item.svg}
        <span>${item.label}</span>
      </button>`;
  }

  C.nav = {
    montar() {
      const { admin, operacao, cadastros } = menu();
      const ativoCad = CADASTROS.includes(C.state.view);

      const mobile = admin
        ? [
            { id: 'entregas', label: 'Entrega', svg: iconBox() },
            { id: 'relatorios', label: 'Relatórios', svg: iconChart() },
            { id: 'cadastros', label: 'Cadastros', svg: iconGrid() }
          ]
        : [{ id: 'entregas', label: 'Entrega', svg: iconBox() }];

      $('nav-itens').innerHTML = mobile.map((item) => {
        const ativo = C.state.view === item.id || (item.id === 'cadastros' && ativoCad);
        return `
          <button type="button" data-nav="${item.id}"
            class="nav-btn flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-bold ${ativo ? 'text-brand-800' : 'text-slate-400'}">
            ${item.svg}
            <span>${item.label}</span>
          </button>`;
      }).join('');

      const side = $('sidebar-nav');
      if (!side) return;
      side.innerHTML = `
        <p class="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-gold-400">Operação</p>
        ${operacao.map(btnLateral).join('')}
        ${cadastros.length ? `
          <p class="mb-2 mt-6 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-gold-400">Cadastros</p>
          ${cadastros.map(btnLateral).join('')}
        ` : ''}
      `;
    },

    mostrarLogin() {
      $('tela-app').classList.add('hidden');
      $('tela-login').classList.remove('hidden');
    },

    mostrarApp() {
      $('tela-login').classList.add('hidden');
      $('tela-app').classList.remove('hidden');
      const rotulo = `${C.utils.primeiroNome(C.state.usuario.nome)} · ${C.utils.isAdmin() ? 'Admin' : 'Equipe'}`;
      $('nome-usuario').textContent = rotulo;
      const sideUser = $('sidebar-user');
      if (sideUser) sideUser.textContent = rotulo;
      const sideVer = $('sidebar-versao');
      if (sideVer) sideVer.textContent = C.rotuloVersao ? C.rotuloVersao() : '';
      C.nav.montar();
      C.nav.irPara('entregas');
    },

    irPara(view) {
      if (!C.utils.isAdmin() && view !== 'entregas') view = 'entregas';
      C.state.view = view;
      const area = C.areas[view];
      $('titulo-view').textContent = area?.titulo || 'Campanha';
      const sub = $('subtitulo-view');
      if (sub) sub.textContent = area?.subtitulo || '';
      document.querySelectorAll('[data-view]').forEach((el) => el.classList.add('hidden'));
      const alvo = $(`view-${view}`);
      if (alvo) alvo.classList.remove('hidden');
      C.nav.montar();
      $('conteudo').scrollTo({ top: 0 });
      if (C.chosen) C.chosen.aplicar(alvo);
      C.nav.carregar(view);
    },

    async carregar(view) {
      const area = C.areas[view];
      if (!area?.carregar) return;
      try {
        C.ui.loading(true);
        await area.carregar();
      } catch (err) {
        C.ui.toast(C.utils.msgErro(err), 'erro');
      } finally {
        C.ui.loading(false);
        if (C.chosen) C.chosen.aplicar($(`view-${view}`));
      }
    },

    abrirCadastros() {
      $('sheet-cadastros').classList.remove('hidden');
    },

    fecharCadastros() {
      $('sheet-cadastros').classList.add('hidden');
    },

    injetarTelas() {
      $('tela-login').innerHTML = C.areas.login.html();
      $('conteudo').innerHTML = ORDEM
        .map((id) => C.areas[id]?.html ? C.areas[id].html() : '')
        .join('');
    },

    bind() {
      async function sair() {
        const ok = await C.ui.confirmar('Deseja sair do sistema?', { rotulo: 'Sair', perigo: false });
        if (ok) await C.auth.sair();
      }
      $('btn-sair').addEventListener('click', sair);
      const btnSairSide = $('btn-sair-sidebar');
      if (btnSairSide) btnSairSide.addEventListener('click', sair);

      $('nav-itens').addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-nav]');
        if (!btn) return;
        if (btn.dataset.nav === 'cadastros') C.nav.abrirCadastros();
        else C.nav.irPara(btn.dataset.nav);
      });

      const side = $('sidebar-nav');
      if (side) {
        side.addEventListener('click', (ev) => {
          const btn = ev.target.closest('[data-nav]');
          if (btn) C.nav.irPara(btn.dataset.nav);
        });
      }

      $('sheet-backdrop').addEventListener('click', C.nav.fecharCadastros);
      document.querySelectorAll('.cad-item').forEach((btn) => {
        btn.addEventListener('click', () => {
          C.nav.fecharCadastros();
          C.nav.irPara(btn.dataset.goto);
        });
      });

      $('conteudo').addEventListener('click', (ev) => {
        const edit = ev.target.closest('[data-edit]');
        const del = ev.target.closest('[data-del]');
        if (edit) C.areas[edit.dataset.edit]?.editar?.(edit.dataset.id);
        if (del) C.areas[del.dataset.del]?.excluir?.(del.dataset.id);
      });
    }
  };
})(window.Campanha);
