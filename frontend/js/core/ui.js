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
        document.querySelectorAll('.modal-cadastro:not(.hidden)').forEach((el) => C.ui.fecharModal(el.id));
      });
    }
  };
})(window.Campanha);
