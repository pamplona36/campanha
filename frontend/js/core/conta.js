window.Campanha = window.Campanha || {};

(function (C) {
  const $ = (id) => C.utils.$(id);

  function papel() {
    return C.utils.rotuloTipo();
  }

  function fechar() {
    const wrap = document.querySelector('.user-menu');
    const lista = $('user-menu-lista');
    const btn = $('btn-user-menu');
    if (wrap) wrap.classList.remove('is-open');
    if (lista) lista.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function abrir() {
    const wrap = document.querySelector('.user-menu');
    const lista = $('user-menu-lista');
    const btn = $('btn-user-menu');
    if (wrap) wrap.classList.add('is-open');
    if (lista) lista.hidden = false;
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }

  function toggle() {
    const wrap = document.querySelector('.user-menu');
    if (wrap?.classList.contains('is-open')) fechar();
    else abrir();
  }

  C.conta = {
    atualizar() {
      const u = C.state.usuario;
      const nome = (u?.nome || '').trim() || 'Usuário';
      const nomeEl = $('user-menu-nome');
      const papelEl = $('user-menu-papel');
      const btn = $('btn-user-menu');
      if (nomeEl) nomeEl.textContent = nome;
      if (papelEl) papelEl.textContent = papel();
      if (btn) btn.title = `${nome} · ${papel()}`;
    },

    bind() {
      const btn = $('btn-user-menu');
      const lista = $('user-menu-lista');
      if (!btn || !lista) return;

      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggle();
      });

      lista.addEventListener('click', async (ev) => {
        const item = ev.target.closest('[data-conta]');
        if (!item) return;
        const acao = item.dataset.conta;
        fechar();
        if (acao === 'sair') {
          const ok = await C.ui.confirmar('Deseja sair do sistema?', { rotulo: 'Sair', perigo: false });
          if (ok) await C.auth.sair();
          return;
        }
        if (acao === 'dados') {
          $('dados-nome').value = C.state.usuario?.nome || '';
          $('dados-login').value = C.state.usuario?.login || '';
          C.ui.abrirModal('modal-dados-pessoais');
          return;
        }
        if (acao === 'senha') {
          $('form-alterar-senha').reset();
          C.ui.abrirModal('modal-alterar-senha');
        }
      });

      document.addEventListener('click', (ev) => {
        if (!ev.target.closest('.user-menu')) fechar();
      });
      document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') fechar();
      });

      $('form-dados-pessoais').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const nome = $('dados-nome').value.trim();
        if (nome.length < 2) {
          C.ui.toast('Informe o nome.', 'erro');
          return;
        }
        try {
          C.ui.loading(true);
          const data = await C.api.rpc('atualizar_meu_perfil', { p_nome: nome });
          if (data?.usuario) C.auth.atualizarSessao(data.usuario);
          C.conta.atualizar();
          C.ui.fecharModal('modal-dados-pessoais');
          C.ui.toast('Dados atualizados.');
        } catch (err) {
          C.ui.toast(C.utils.msgErro(err), 'erro');
        } finally {
          C.ui.loading(false);
        }
      });

      $('form-alterar-senha').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const atual = $('senha-atual').value;
        const nova = $('senha-nova').value;
        const confirma = $('senha-confirma').value;
        if (nova.length < 6) {
          C.ui.toast('A nova senha deve ter no mínimo 6 caracteres.', 'erro');
          return;
        }
        if (nova !== confirma) {
          C.ui.toast('A confirmação não confere com a nova senha.', 'erro');
          return;
        }
        try {
          C.ui.loading(true);
          await C.api.rpc('alterar_minha_senha', {
            p_senha_atual: atual,
            p_senha_nova: nova
          });
          C.ui.fecharModal('modal-alterar-senha');
          C.ui.toast('Senha alterada.');
        } catch (err) {
          C.ui.toast(C.utils.msgErro(err), 'erro');
        } finally {
          C.ui.loading(false);
        }
      });

      $('modal-alterar-senha').addEventListener('cadastro:fechar', () => {
        $('form-alterar-senha').reset();
      });
    }
  };
})(window.Campanha);
