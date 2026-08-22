window.Campanha = window.Campanha || {};

(function (C) {
  const TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  let carregando = null;
  let worker = null;

  function carregarScript() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (carregando) return carregando;
    carregando = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TESSERACT_SRC;
      s.async = true;
      s.onload = () => resolve(window.Tesseract);
      s.onerror = () => {
        carregando = null;
        reject(new Error('Não foi possível carregar a leitura do comprovante.'));
      };
      document.head.appendChild(s);
    });
    return carregando;
  }

  function paraISO(d, m, y) {
    let ano = String(y);
    if (ano.length === 2) ano = Number(ano) > 50 ? `19${ano}` : `20${ano}`;
    const dia = Number(d);
    const mes = Number(m);
    const nAno = Number(ano);
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12 || nAno < 2000 || nAno > 2100) return '';
    const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const dt = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(dt.getTime())) return '';
    const hoje = new Date();
    hoje.setHours(23, 59, 59, 999);
    if (dt > hoje) return '';
    return iso;
  }

  function parseMoeda(bruto) {
    const t = String(bruto || '').replace(/\s/g, '');
    if (!t) return null;
    if (t.includes(',')) {
      const [intPart, decPart = '00'] = t.split(',');
      const n = Number(`${intPart.replace(/\./g, '')}.${decPart.slice(0, 2).padEnd(2, '0')}`);
      return Number.isFinite(n) ? n : null;
    }
    if (t.includes('.')) {
      const partes = t.split('.');
      if (partes[partes.length - 1].length === 2 && partes.length <= 2) {
        const n = Number(t);
        return Number.isFinite(n) ? n : null;
      }
      const n = Number(t.replace(/\./g, ''));
      return Number.isFinite(n) ? n : null;
    }
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  function extrairValor(texto) {
    const t = String(texto || '').replace(/\s+/g, ' ');
    const candidatos = [];
    const rs = [...t.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/gi)];
    rs.forEach((m) => {
      const n = parseMoeda(`${m[1]},${m[2] || '00'}`);
      if (n && n > 0 && n < 1000000) candidatos.push(n);
    });
    if (candidatos.length) return Math.max(...candidatos);

    const nums = [...t.matchAll(/\b(\d{1,3}(?:\.\d{3})+|\d{2,6}),(\d{2})\b/g)];
    nums.forEach((m) => {
      const n = parseMoeda(`${m[1]},${m[2]}`);
      if (n && n >= 1 && n < 1000000) candidatos.push(n);
    });
    if (candidatos.length) return Math.max(...candidatos);
    return null;
  }

  function extrairData(texto) {
    const t = String(texto || '');
    const matches = [...t.matchAll(/\b(\d{2})[/.\\-](\d{2})[/.\\-](\d{2,4})\b/g)];
    const datas = matches.map((m) => paraISO(m[1], m[2], m[3])).filter(Boolean);
    if (!datas.length) return '';
    return datas.sort().at(-1);
  }

  async function compactar(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(async () => {
      const url = URL.createObjectURL(file);
      try {
        const img = await new Promise((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = reject;
          el.src = url;
        });
        return img;
      } finally {
        URL.revokeObjectURL(url);
      }
    });
    const max = 1280;
    let w = bitmap.width;
    let h = bitmap.height;
    if (w > max || h > max) {
      const r = Math.min(max / w, max / h);
      w = Math.round(w * r);
      h = Math.round(h * r);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();
    let qualidade = 0.74;
    let dataUrl = canvas.toDataURL('image/jpeg', qualidade);
    while (dataUrl.length > 900000 && qualidade > 0.42) {
      qualidade -= 0.08;
      dataUrl = canvas.toDataURL('image/jpeg', qualidade);
    }
    return dataUrl;
  }

  async function reconhecer(dataUrl, onProgress) {
    const Tesseract = await carregarScript();
    if (!worker) {
      worker = await Tesseract.createWorker('por', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text' && typeof onProgress === 'function') {
            onProgress(m.progress);
          }
        }
      });
    }
    const { data } = await worker.recognize(dataUrl);
    return String(data?.text || '');
  }

  C.ocr = {
    async lerComprovante(file, onProgress) {
      const dataUrl = await compactar(file);
      let texto = '';
      try {
        texto = await reconhecer(dataUrl, onProgress);
      } catch (err) {
        return { dataUrl, texto: '', data: '', valor: null, erro: err };
      }
      return {
        dataUrl,
        texto,
        data: extrairData(texto),
        valor: extrairValor(texto),
        erro: null
      };
    }
  };
})(window.Campanha);
