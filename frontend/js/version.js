window.Campanha = window.Campanha || {};

Campanha.VERSION = {
  number: '1.0.14',
  released: '2026-09-08'
};

Campanha.rotuloVersao = function () {
  return 'v' + (Campanha.VERSION.number || '0.0.0');
};
