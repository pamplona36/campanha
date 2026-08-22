window.Campanha = window.Campanha || {};

Campanha.state = {
  token: null,
  usuario: null,
  view: 'entregas',
  cache: {
    colaboradores: [],
    materiais: [],
    tipos: [],
    usuarios: [],
    equipe: [],
    entregas: []
  }
};

Campanha.areas = Campanha.areas || {};
