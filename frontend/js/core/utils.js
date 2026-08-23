window.Campanha = window.Campanha || {};

Campanha.utils = {
  $(id) {
    return document.getElementById(id);
  },

  esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  hojeISO() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  },

  formatarData(iso) {
    if (!iso) return '—';
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
  },

  formatarMoeda(n) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n || 0));
  },

  soDigitos(value) {
    return String(value || '').replace(/\D/g, '');
  },

  formatarCpf(value) {
    const d = Campanha.utils.soDigitos(value).slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  },

  formatarTelefone(value) {
    const d = Campanha.utils.soDigitos(value).slice(0, 11);
    if (!d) return '';
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  },

  telefoneValido(value) {
    const d = Campanha.utils.soDigitos(value);
    return !d || d.length === 10 || d.length === 11;
  },

  cpfValido(value) {
    const d = Campanha.utils.soDigitos(value);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    const dv = (base) => {
      let soma = 0;
      for (let i = 0; i < base; i += 1) soma += Number(d[i]) * (base + 1 - i);
      const resto = (soma * 10) % 11;
      return resto === 10 ? 0 : resto;
    };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
  },

  rotuloBanco(codigo) {
    if (!codigo) return '';
    const code = String(codigo).padStart(3, '0');
    const banco = (Campanha.BANCOS || []).find((b) => b.code === code);
    return banco ? `${banco.code} — ${banco.name}` : code;
  },

  primeiroNome(nome) {
    return String(nome || '').trim().split(/\s+/)[0] || 'Usuário';
  },

  msgErro(error) {
    const raw = error?.message || error?.erro || String(error || 'Falha na operação');
    return raw.replace(/^ERROR:\s*/i, '').replace(/^\s*P0001:\s*/i, '').trim();
  },

  tipoUsuario(tipo) {
    const t = String(tipo ?? Campanha.state.usuario?.tipo ?? '').toLowerCase();
    if (t === 'usuario') return 'motorista';
    return t;
  },

  isAdmin() {
    return Campanha.utils.tipoUsuario() === 'admin';
  },

  isGeral() {
    return Campanha.utils.tipoUsuario() === 'geral';
  },

  isMotorista() {
    return Campanha.utils.tipoUsuario() === 'motorista';
  },

  podeGestao() {
    return Campanha.utils.isAdmin() || Campanha.utils.isGeral();
  },

  podeFolha() {
    return Campanha.utils.isAdmin();
  },

  podeAcessar(view) {
    if (view === 'entregas') return true;
    if (view === 'folha') return Campanha.utils.podeFolha();
    return Campanha.utils.podeGestao();
  },

  rotuloTipo(tipo) {
    const mapa = {
      admin: 'Administrador',
      geral: 'Geral',
      motorista: 'Motorista'
    };
    return mapa[Campanha.utils.tipoUsuario(tipo)] || 'Motorista';
  },

  TIPOS_COLABORADOR: [
    { id: 'lider', nome: 'Líder' },
    { id: 'agente', nome: 'Agente' },
    { id: 'comercio', nome: 'Comércio' }
  ],

  rotuloTipoColaborador(tipo) {
    return Campanha.utils.TIPOS_COLABORADOR.find((t) => t.id === tipo)?.nome || '';
  },

  preencherSelect(el, items, { value, label, placeholder } = {}) {
    const esc = Campanha.utils.esc;
    const opts = [`<option value="">${esc(placeholder || 'Selecione')}</option>`];
    for (const item of items) {
      const v = typeof item === 'string' ? item : item[value];
      const l = typeof item === 'string' ? item : item[label];
      opts.push(`<option value="${esc(v)}">${esc(l)}</option>`);
    }
    el.innerHTML = opts.join('');
    if (Campanha.chosen) Campanha.chosen.atualizar(el);
  },

  definirSelect(el, valor) {
    el.value = valor ?? '';
    if (Campanha.chosen) Campanha.chosen.atualizar(el);
  },

  preencherSelectMulti(el, items, { value, label, selecionados } = {}) {
    const esc = Campanha.utils.esc;
    const marcados = new Set((selecionados || []).map(String));
    el.innerHTML = (items || []).map((item) => {
      const v = typeof item === 'string' ? item : item[value];
      const l = typeof item === 'string' ? item : item[label];
      const sel = marcados.has(String(v)) ? ' selected' : '';
      return `<option value="${esc(v)}"${sel}>${esc(l)}</option>`;
    }).join('');
    if (Campanha.chosen) Campanha.chosen.atualizar(el);
  },

  valoresSelect(el) {
    return Array.from(el.selectedOptions || [])
      .map((opt) => opt.value)
      .filter(Boolean);
  },

  matchFiltro(termo, ...campos) {
    const t = String(termo || '').trim().toLowerCase();
    if (!t) return true;
    return campos.some((c) => String(c || '').toLowerCase().includes(t));
  },

  STATUS_ENTREGA: [
    { id: 'novo', nome: 'Novo' },
    { id: 'entrega_iniciada', nome: 'Entrega iniciada' },
    { id: 'entregue', nome: 'Entregue' },
    { id: 'reagendado', nome: 'Reagendado' }
  ],

  rotuloStatus(id) {
    return Campanha.utils.STATUS_ENTREGA.find((s) => s.id === id)?.nome || id || 'Novo';
  },

  statusEntrega(e) {
    return e?.status || 'novo';
  },

  classeStatus(id) {
    const mapa = {
      novo: 'badge-status-novo',
      entrega_iniciada: 'badge-status-entrega_iniciada',
      entregue: 'badge-status-entregue',
      reagendado: 'badge-status-reagendado'
    };
    return mapa[id] || mapa.novo;
  }
};
