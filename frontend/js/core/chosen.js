window.Campanha = window.Campanha || {};

(function (C) {
  const jq = window.jQuery;

  const OPCOES_PADRAO = {
    width: '100%',
    search_contains: true,
    no_results_text: 'Nada encontrado: ',
    disable_search_threshold: 0
  };

  function alvo(el) {
    if (!el) return jq('select');
    if (el.jquery) return el.is('select') ? el : el.find('select');
    const node = typeof el === 'string' ? document.getElementById(el) : el;
    if (!node) return jq();
    return node.tagName === 'SELECT' ? jq(node) : jq(node).find('select');
  }

  function opcoes($el) {
    if ($el.prop('multiple')) {
      return {
        ...OPCOES_PADRAO,
        placeholder_text_multiple: $el.attr('data-placeholder') || 'Selecione'
      };
    }
    return {
      ...OPCOES_PADRAO,
      allow_single_deselect: true,
      placeholder_text_single: 'Selecione'
    };
  }

  function ehToque() {
    return window.matchMedia('(hover: none), (pointer: coarse)').matches || window.innerWidth < 1024;
  }

  function alturaNav() {
    const nav = document.getElementById('nav-inferior');
    if (!nav || window.innerWidth >= 1024) return 0;
    const style = window.getComputedStyle(nav);
    if (style.display === 'none') return 0;
    return nav.getBoundingClientRect().height || 0;
  }

  function scrollConteudo() {
    return document.getElementById('conteudo');
  }

  function restaurarScroll(top) {
    const el = scrollConteudo();
    if (!el) return;
    el.scrollTop = top;
    requestAnimationFrame(() => { el.scrollTop = top; });
    setTimeout(() => { el.scrollTop = top; }, 0);
    setTimeout(() => { el.scrollTop = top; }, 80);
  }

  function ajustarDropdown($select) {
    const inst = $select.data('chosen');
    if (!inst || !inst.container) return;
    const $container = inst.container;
    const $drop = $container.find('.chosen-drop');
    const $results = $container.find('.chosen-results');
    const rect = $container[0].getBoundingClientRect();
    const margem = alturaNav() + 12;
    const abaixo = window.innerHeight - rect.bottom - margem;
    const acima = rect.top - 12;
    const abrirCima = abaixo < 220 && acima > abaixo;

    $container.toggleClass('chosen-drop-up', abrirCima);

    const disponivel = Math.max(120, abrirCima ? acima : abaixo);
    $results.css('max-height', `${Math.min(220, disponivel - 56)}px`);
    $drop.css({
      maxHeight: `${disponivel}px`
    });
  }

  C.chosen = {
    aplicar(escopo) {
      if (!jq || !jq.fn.chosen) return;
      alvo(escopo).each(function () {
        const $el = jq(this);
        if ($el.hasClass('no-chosen') || $el.is('[data-native]')) return;
        if ($el.data('chosen')) $el.trigger('chosen:updated');
        else $el.chosen(opcoes($el));
      });
    },

    atualizar(el) {
      if (!jq || !jq.fn.chosen) return;
      alvo(el).each(function () {
        const $el = jq(this);
        if ($el.hasClass('no-chosen') || $el.is('[data-native]')) return;
        if ($el.data('chosen')) $el.trigger('chosen:updated');
        else $el.chosen(opcoes($el));
      });
    }
  };

  if (jq) {
    let scrollSalvo = 0;

    jq(document)
      .on('mousedown touchstart', '.chosen-container', () => {
        const el = scrollConteudo();
        scrollSalvo = el ? el.scrollTop : 0;
      })
      .on('chosen:showing_dropdown', 'select', function () {
        const $select = jq(this);
        const el = scrollConteudo();
        const top = el ? el.scrollTop : scrollSalvo;
        ajustarDropdown($select);

        const inst = $select.data('chosen');
        const campo = inst && inst.search_field && inst.search_field[0];
        if (campo) {
          if (ehToque()) campo.blur();
          else campo.focus({ preventScroll: true });
        }

        restaurarScroll(top);
      })
      .on('chosen:hiding_dropdown', 'select', function () {
        const inst = jq(this).data('chosen');
        if (!inst || !inst.container) return;
        inst.container.removeClass('chosen-drop-up');
        inst.container.find('.chosen-results').css('max-height', '');
        inst.container.find('.chosen-drop').css({ maxHeight: '' });
      });
  }
})(window.Campanha);
