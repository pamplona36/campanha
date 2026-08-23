window.Campanha = window.Campanha || {};

(function (C) {
  let deferred = null;

  function $(id) {
    return document.getElementById(id);
  }

  function jaInstalado() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  }

  function ehIOS() {
    const ua = navigator.userAgent || '';
    return /iphone|ipad|ipod/i.test(ua)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function mostrarBotoes(on) {
    document.querySelectorAll('[data-instalar-app]').forEach((el) => {
      el.classList.toggle('is-on', on);
      el.hidden = !on;
    });
  }

  function atualizarVisibilidade() {
    mostrarBotoes(!jaInstalado());
  }

  function fecharAjuda() {
    ['pwa-ios-ajuda', 'pwa-android-ajuda'].forEach((id) => {
      const box = $(id);
      if (!box) return;
      box.classList.add('hidden');
      box.classList.remove('flex');
    });
  }

  function abrirAjuda() {
    const id = ehIOS() ? 'pwa-ios-ajuda' : 'pwa-android-ajuda';
    const box = $(id);
    if (!box) {
      if (C.ui) C.ui.toast('No navegador, abra o menu e toque em Instalar aplicativo.', 'info');
      return;
    }
    fecharAjuda();
    box.classList.remove('hidden');
    box.classList.add('flex');
  }

  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    deferred = ev;
    atualizarVisibilidade();
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    mostrarBotoes(false);
    if (C.ui) C.ui.toast('Aplicativo instalado no dispositivo.');
  });

  if ('serviceWorker' in navigator) {
    const sw = new URL('sw.js', document.baseURI);
    navigator.serviceWorker.register(sw.href).catch(() => {});
  }

  C.pwa = {
    atualizar: atualizarVisibilidade,

    init() {
      document.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-instalar-app]')) {
          ev.preventDefault();
          C.pwa.instalar();
          return;
        }
        if (ev.target.closest('[data-close-ios-pwa]')) fecharAjuda();
      });
      atualizarVisibilidade();
    },

    async instalar() {
      if (jaInstalado()) {
        if (C.ui) C.ui.toast('O aplicativo já está instalado.', 'info');
        return;
      }
      if (deferred) {
        const ev = deferred;
        try {
          ev.prompt();
          await ev.userChoice;
        } catch (_) {
          abrirAjuda();
        }
        deferred = null;
        atualizarVisibilidade();
        return;
      }
      abrirAjuda();
    }
  };
})(window.Campanha);
