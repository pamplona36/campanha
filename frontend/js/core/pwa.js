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
    return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  }

  function ehMobile() {
    return window.matchMedia('(max-width: 1023px)').matches
      || /android|iphone|ipad|ipod/i.test(navigator.userAgent || '');
  }

  function mostrarBotoes(on) {
    document.querySelectorAll('[data-instalar-app]').forEach((el) => {
      el.classList.toggle('hidden', !on);
    });
  }

  function atualizarVisibilidade() {
    if (jaInstalado()) {
      mostrarBotoes(false);
      return;
    }
    mostrarBotoes(ehMobile() || Boolean(deferred));
  }

  C.pwa = {
    init() {
      window.addEventListener('beforeinstallprompt', (ev) => {
        ev.preventDefault();
        deferred = ev;
        atualizarVisibilidade();
      });
      window.addEventListener('appinstalled', () => {
        deferred = null;
        mostrarBotoes(false);
        C.ui.toast('Aplicativo instalado no dispositivo.');
      });

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      }

      document.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-instalar-app]')) {
          C.pwa.instalar();
          return;
        }
        if (ev.target.closest('[data-close-ios-pwa]')) {
          const box = $('pwa-ios-ajuda');
          if (!box) return;
          box.classList.add('hidden');
          box.classList.remove('flex');
        }
      });

      atualizarVisibilidade();
    },

    async instalar() {
      if (jaInstalado()) {
        C.ui.toast('O aplicativo já está instalado.', 'info');
        return;
      }
      if (deferred) {
        deferred.prompt();
        const escolha = await deferred.userChoice;
        if (escolha.outcome !== 'accepted') {
          C.ui.toast('Instalação cancelada.', 'info');
        }
        deferred = null;
        atualizarVisibilidade();
        return;
      }
      if (ehIOS()) {
        $('pwa-ios-ajuda')?.classList.remove('hidden');
        $('pwa-ios-ajuda')?.classList.add('flex');
        return;
      }
      C.ui.toast('No celular, abra o menu do navegador e toque em Instalar aplicativo.', 'info');
    }
  };
})(window.Campanha);
