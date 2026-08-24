window.Campanha = window.Campanha || {};

Campanha.VERSION = {
  number: '1.0.9',
  released: '2026-08-24'
};

Campanha.rotuloVersao = function () {
  return 'v' + (Campanha.VERSION.number || '0.0.0');
};
