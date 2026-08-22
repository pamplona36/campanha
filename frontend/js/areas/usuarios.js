window.Campanha = window.Campanha || {};

(function (C) {
  const $ = (id) => C.utils.$(id);
  const { esc, matchFiltro } = C.utils;
  let filtro = '';

  function resetForm() {
    $('form-usuario').reset();
    $('usu-id').value = '';
    $('usu-form-titulo').textContent = 'Novo usuário';
    $('usu-senha-hint').textContent = 'Mínimo de 6 caracteres.';
    $('usu-senha').required = true;
    C.chosen.atualizar($('usu-tipo'));
  }

  function abrirNovo() {
    resetForm();
    C.ui.abrirModal('modal-usuario');
  }

  function listaFiltrada() {
    const itens = C.state.cache.usuarios || [];
    return itens.filter((u) => matchFiltro(filtro, u.nome, u.login, u.tipo === 'admin' ? 'administrador admin' : 'usuario'));
  }

  function render() {
    const box = $('lista-usuarios');
    const itens = listaFiltrada();
    if (!itens.length) {
      box.innerHTML = C.ui.vazio(filtro ? 'Nenhum usuário encontrado.' : 'Nenhum usuário cadastrado.');
      return;
    }
    box.innerHTML = C.ui.listaDupla({
      vazioTexto: 'Nenhum usuário cadastrado.',
      cards: itens.map((u) => `
        <article class="rounded-3xl bg-white p-4 shadow-card">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h4 class="text-base font-extrabold">${esc(u.nome)}</h4>
              <p class="text-sm text-slate-500">@${esc(u.login)}</p>
            </div>
            <span class="rounded-full px-3 py-1 text-xs font-bold ${u.tipo === 'admin' ? 'bg-gold-500/20 text-amber-800' : 'bg-slate-100 text-slate-600'}">
              ${u.tipo === 'admin' ? 'Admin' : 'Usuário'}
            </span>
          </div>
          ${C.ui.botoesCard(u.id, 'usuarios')}
        </article>
      `).join(''),
      colunas: ['Nome', 'Login', 'Tipo', 'Ações'],
      linhas: itens.map((u) => `
        <tr>
          <td class="font-semibold text-slate-900">${esc(u.nome)}</td>
          <td>@${esc(u.login)}</td>
          <td>${u.tipo === 'admin' ? 'Administrador' : 'Usuário'}</td>
          <td>${C.ui.botoesLinha(u.id, 'usuarios')}</td>
        </tr>
      `)
    });
  }

  C.areas.usuarios = {
    titulo: 'Usuários',
    subtitulo: 'Cadastro de logins e permissões',
    chave: 'usuarios',

    html() {
      return `
        <div id="view-usuarios" data-view class="hidden space-y-4">
          ${C.ui.barraCrud({
            filtroId: 'filtro-usuarios',
            placeholder: 'Filtrar por nome ou login',
            botaoId: 'btn-novo-usuario'
          })}
          <div id="lista-usuarios"></div>
          ${C.ui.modalCadastro({
            id: 'modal-usuario',
            tituloId: 'usu-form-titulo',
            formHtml: `
              <form id="form-usuario">
                <input type="hidden" id="usu-id" />

                <label class="mb-1 block text-sm font-semibold" for="usu-nome">Nome</label>
                <input id="usu-nome" class="field mb-3" required />

                <label class="mb-1 block text-sm font-semibold" for="usu-login">Login</label>
                <input id="usu-login" class="field mb-3" autocomplete="off" required />

                <label class="mb-1 block text-sm font-semibold" for="usu-senha">Senha</label>
                <input id="usu-senha" type="password" class="field mb-1" autocomplete="new-password" />
                <p id="usu-senha-hint" class="mb-3 text-xs text-slate-500">Mínimo de 6 caracteres.</p>

                <label class="mb-1 block text-sm font-semibold" for="usu-tipo">Tipo</label>
                <select id="usu-tipo" class="field mb-4">
                  <option value="usuario">Usuário</option>
                  <option value="admin">Administrador</option>
                </select>

                <div class="flex gap-2">
                  <button type="submit" class="btn-primary flex-1">Salvar</button>
                  <button type="button" id="btn-cancelar-usuario" class="min-h-[52px] flex-1 rounded-2xl bg-slate-100 font-bold text-slate-600">Cancelar</button>
                </div>
              </form>
            `
          })}
        </div>
      `;
    },

    bind() {
      $('btn-novo-usuario').addEventListener('click', abrirNovo);
      $('filtro-usuarios').addEventListener('input', (ev) => {
        filtro = ev.target.value;
        render();
      });
      $('modal-usuario').addEventListener('cadastro:fechar', resetForm);
      $('btn-cancelar-usuario').addEventListener('click', () => C.ui.fecharModal('modal-usuario'));
      $('form-usuario').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const id = $('usu-id').value || null;
        const senha = $('usu-senha').value;
        if (!id && senha.length < 6) {
          C.ui.toast('A senha deve ter no mínimo 6 caracteres.', 'erro');
          return;
        }
        if (id && senha && senha.length < 6) {
          C.ui.toast('A nova senha deve ter no mínimo 6 caracteres.', 'erro');
          return;
        }
        try {
          C.ui.loading(true);
          await C.api.rpc('salvar_usuario', {
            p_id: id,
            p_nome: $('usu-nome').value,
            p_login: $('usu-login').value,
            p_senha: senha || null,
            p_tipo: $('usu-tipo').value
          });
          C.ui.fecharModal('modal-usuario');
          C.ui.toast('Usuário salvo.');
          await C.areas.usuarios.carregar();
        } catch (err) {
          C.ui.toast(C.utils.msgErro(err), 'erro');
        } finally {
          C.ui.loading(false);
        }
      });
    },

    async carregar() {
      const lista = await C.api.rpc('listar_usuarios');
      C.state.cache.usuarios = lista || [];
      render();
    },

    editar(id) {
      const u = C.state.cache.usuarios.find((x) => x.id === id);
      if (!u) return;
      $('usu-id').value = u.id;
      $('usu-nome').value = u.nome;
      $('usu-login').value = u.login;
      C.utils.definirSelect($('usu-tipo'), u.tipo);
      $('usu-senha').value = '';
      $('usu-senha').required = false;
      $('usu-form-titulo').textContent = 'Editar usuário';
      $('usu-senha-hint').textContent = 'Deixe em branco para manter a senha atual.';
      C.ui.abrirModal('modal-usuario');
    },

    excluir(id) {
      return C.api.excluir('excluir_usuario', id, () => C.areas.usuarios.carregar());
    }
  };
})(window.Campanha);
