window.Campanha = window.Campanha || {};

(function (C) {
  const $ = (id) => C.utils.$(id);
  let confirmResolver = null;

  C.ui = {
    toast(texto, tipo = 'ok') {
      const toastr = window.toastr;
      if (!toastr) return;
      const mapa = {
        ok: 'success',
        success: 'success',
        erro: 'error',
        error: 'error',
        info: 'info',
        aviso: 'warning',
        warning: 'warning'
      };
      const metodo = mapa[tipo] || 'success';
      toastr[metodo](String(texto || ''));
    },

    loading(on) {
      const el = $('loading');
      el.classList.toggle('hidden', !on);
      el.classList.toggle('flex', on);
    },

    confirmar(texto, { rotulo = 'Excluir', perigo = true } = {}) {
      $('confirm-texto').textContent = texto;
      const sim = $('confirm-sim');
      sim.textContent = rotulo;
      sim.className = perigo
        ? 'min-h-[48px] flex-1 rounded-2xl bg-red-600 font-bold text-white'
        : 'min-h-[48px] flex-1 rounded-2xl bg-brand-800 font-bold text-white';
      $('modal-confirm').classList.remove('hidden');
      $('modal-confirm').classList.add('flex');
      return new Promise((resolve) => { confirmResolver = resolve; });
    },

    fecharConfirm(ok) {
      $('modal-confirm').classList.add('hidden');
      $('modal-confirm').classList.remove('flex');
      if (confirmResolver) confirmResolver(Boolean(ok));
      confirmResolver = null;
    },

    vazio(texto) {
      return `
        <div class="rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
          <p class="text-sm font-semibold text-slate-500">${C.utils.esc(texto)}</p>
        </div>
      `;
    },

    botoesCard(id, prefixo) {
      const esc = C.utils.esc;
      return `
        <div class="mt-3 flex gap-2">
          <button type="button" data-edit="${prefixo}" data-id="${esc(id)}"
            class="min-h-[44px] flex-1 rounded-xl bg-brand-50 text-sm font-bold text-brand-800">Editar</button>
          <button type="button" data-del="${prefixo}" data-id="${esc(id)}"
            class="min-h-[44px] flex-1 rounded-xl bg-red-50 text-sm font-bold text-red-700">Excluir</button>
        </div>
      `;
    },

    botoesLinha(id, prefixo, { excluir = true } = {}) {
      const esc = C.utils.esc;
      return `
        <div class="flex justify-end gap-2">
          ${prefixo !== 'entregas' ? `<button type="button" data-edit="${prefixo}" data-id="${esc(id)}"
            class="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-800">Editar</button>` : ''}
          ${excluir ? `<button type="button" data-del="${prefixo}" data-id="${esc(id)}"
            class="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700">Excluir</button>` : ''}
        </div>
      `;
    },

    icone(nome) {
      const path = {
        editar: '<path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>',
        visualizar: '<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>',
        mapa: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 21s7-5.4 7-11a7 7 0 10-14 0c0 5.6 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
        excluir: '<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>',
        pagamento: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'
      }[nome];
      if (!path) return '';
      return `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">${path}</svg>`;
    },

    itemMenu({ rotulo, icone, attrs = '', perigo = false, desativado = false }) {
      const esc = C.utils.esc;
      const icon = C.ui.icone(icone);
      if (desativado) {
        return `<span class="ent-menu-item is-off">${icon}${esc(rotulo)}</span>`;
      }
      return `<button type="button" role="menuitem" class="ent-menu-item${perigo ? ' is-danger' : ''}" ${attrs}>${icon}${esc(rotulo)}</button>`;
    },

    menuAcoes(id, itensHtml) {
      const esc = C.utils.esc;
      return `
        <div class="ent-menu">
          <button type="button" class="ent-menu-btn" data-acoes-menu="${esc(id)}" aria-haspopup="true" aria-expanded="false">
            Ações
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div class="ent-menu-lista" role="menu" hidden>${itensHtml}</div>
        </div>
      `;
    },

    menuAcoesCrud(id, prefixo) {
      const esc = C.utils.esc;
      return C.ui.menuAcoes(id, [
        C.ui.itemMenu({ rotulo: 'Editar', icone: 'editar', attrs: `data-edit="${esc(prefixo)}" data-id="${esc(id)}"` }),
        C.ui.itemMenu({ rotulo: 'Excluir', icone: 'excluir', attrs: `data-del="${esc(prefixo)}" data-id="${esc(id)}"`, perigo: true })
      ].join(''));
    },

    fecharMenusAcoes() {
      document.querySelectorAll('.ent-menu.is-open').forEach((menu) => {
        menu.classList.remove('is-open', 'is-up');
        const btn = menu.querySelector('[data-acoes-menu]');
        const lista = menu.querySelector('.ent-menu-lista');
        if (btn) btn.setAttribute('aria-expanded', 'false');
        if (lista) lista.hidden = true;
      });
    },

    abrirMenuAcoes(btn) {
      const wrap = btn.closest('.ent-menu');
      const lista = wrap?.querySelector('.ent-menu-lista');
      if (!wrap || !lista) return;
      const jaAberto = wrap.classList.contains('is-open');
      C.ui.fecharMenusAcoes();
      if (jaAberto) return;
      wrap.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      lista.hidden = false;
      const rect = btn.getBoundingClientRect();
      const altura = lista.offsetHeight || 160;
      if (rect.bottom + altura + 12 > window.innerHeight && rect.top > altura) {
        wrap.classList.add('is-up');
      }
    },

    listaDupla({ vazioTexto, cards, colunas, linhas }) {
      if (!linhas || !linhas.length) return C.ui.vazio(vazioTexto);
      return `
        <div class="space-y-3 lg:hidden">${cards}</div>
        <div class="table-wrap hidden lg:block">
          <table class="data-table">
            <thead>
              <tr>${colunas.map((c) => `<th>${c}</th>`).join('')}</tr>
            </thead>
            <tbody>${linhas.join('')}</tbody>
          </table>
        </div>
      `;
    },

    barraCrud({ filtroId, placeholder, botaoId, rotulo = 'Cadastrar' }) {
      const esc = C.utils.esc;
      return `
        <div class="page-toolbar">
          <input id="${esc(filtroId)}" type="search" class="field" placeholder="${esc(placeholder || 'Filtrar...')}" autocomplete="off" />
          <button type="button" id="${esc(botaoId)}" class="btn-primary">${esc(rotulo)}</button>
        </div>
      `;
    },

    modalCadastro({ id, tituloId, formHtml, largo } = {}) {
      const esc = C.utils.esc;
      return `
        <div id="${esc(id)}" class="modal-cadastro hidden" aria-hidden="true">
          <div class="modal-cadastro-backdrop"></div>
          <div class="modal-cadastro-box${largo ? ' modal-wide' : ''}" role="dialog" aria-modal="true">
            <div class="modal-cadastro-head">
              <p id="${esc(tituloId)}" class="min-w-0 flex-1 text-base font-extrabold text-slate-800"></p>
              <button type="button" class="modal-cadastro-x" data-close-modal="${esc(id)}" aria-label="Fechar">&times;</button>
            </div>
            ${formHtml}
          </div>
        </div>
      `;
    },

    abrirModal(id) {
      const el = $(id);
      if (!el) return;
      el.classList.remove('hidden');
      el.setAttribute('aria-hidden', 'false');
      document.body.classList.add('overflow-hidden');
      if (C.chosen) C.chosen.aplicar(el);
    },

    fecharModal(id) {
      const el = typeof id === 'string' ? $(id) : id;
      if (!el || el.classList.contains('hidden')) return;
      el.classList.add('hidden');
      el.setAttribute('aria-hidden', 'true');
      if (!document.querySelector('.modal-cadastro:not(.hidden)')) {
        document.body.classList.remove('overflow-hidden');
      }
      el.dispatchEvent(new CustomEvent('cadastro:fechar', { bubbles: true }));
    },

    bind() {
      if (window.toastr) {
        window.toastr.options = {
          closeButton: true,
          debug: false,
          newestOnTop: true,
          progressBar: true,
          positionClass: 'toast-top-center',
          preventDuplicates: true,
          showDuration: 220,
          hideDuration: 220,
          timeOut: 3500,
          extendedTimeOut: 1600,
          showEasing: 'swing',
          hideEasing: 'linear',
          showMethod: 'fadeIn',
          hideMethod: 'fadeOut'
        };
      }
      $('confirm-sim').addEventListener('click', () => C.ui.fecharConfirm(true));
      $('confirm-nao').addEventListener('click', () => C.ui.fecharConfirm(false));
      document.querySelector('[data-close-confirm]').addEventListener('click', () => C.ui.fecharConfirm(false));
      document.addEventListener('click', (ev) => {
        const toggle = ev.target.closest('[data-acoes-menu]');
        if (toggle) {
          ev.preventDefault();
          ev.stopPropagation();
          C.ui.abrirMenuAcoes(toggle);
          return;
        }
        if (ev.target.closest('.ent-menu-item')) {
          setTimeout(() => C.ui.fecharMenusAcoes(), 0);
        } else if (!ev.target.closest('.ent-menu')) {
          C.ui.fecharMenusAcoes();
        }
        const btn = ev.target.closest('[data-close-modal]');
        if (!btn || ev.target.closest('.modal-cadastro-backdrop')) return;
        C.ui.fecharModal(btn.getAttribute('data-close-modal'));
      });
      document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          const form = ev.target.closest('.modal-cadastro form');
          if (!form) return;
          const tag = String(ev.target.tagName || '').toLowerCase();
          if (tag === 'textarea' || ev.target.type === 'submit') return;
          ev.preventDefault();
          return;
        }
        if (ev.key !== 'Escape') return;
        C.ui.fecharMenusAcoes();
        document.querySelectorAll('.modal-cadastro:not(.hidden)').forEach((el) => C.ui.fecharModal(el.id));
      });
    }
  };
})(window.Campanha);
