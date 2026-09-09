window.Campanha = window.Campanha || {};

Campanha.VERSION = {
  number: '1.0.15',
  released: '2026-09-09'
};

Campanha.rotuloVersao = function () {
  return 'v' + (Campanha.VERSION.number || '0.0.0');
};
