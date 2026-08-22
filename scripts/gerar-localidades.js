const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '..', 'backend', 'sql', 'patch-localidades.sql');

function sqlStr(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const DDL = `-- Estados e cidades (IBGE) para o cadastro de colaborador.
-- Rode no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS public.estados (
  uf    text PRIMARY KEY,
  nome  text NOT NULL,
  CONSTRAINT estados_uf_chk CHECK (char_length(uf) = 2)
);

CREATE TABLE IF NOT EXISTS public.cidades (
  id       serial PRIMARY KEY,
  uf       text NOT NULL REFERENCES public.estados(uf) ON UPDATE CASCADE ON DELETE RESTRICT,
  nome     text NOT NULL,
  ibge_id  integer
);

ALTER TABLE public.cidades ADD COLUMN IF NOT EXISTS ibge_id integer;
CREATE UNIQUE INDEX IF NOT EXISTS cidades_uf_nome_uidx ON public.cidades (uf, nome);
CREATE UNIQUE INDEX IF NOT EXISTS cidades_ibge_uidx ON public.cidades (ibge_id) WHERE ibge_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cidades_uf ON public.cidades (uf);

ALTER TABLE public.estados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cidades ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.estados FROM anon, authenticated;
REVOKE ALL ON TABLE public.cidades FROM anon, authenticated;
`;

const FUNCOES = `
CREATE OR REPLACE FUNCTION public.listar_estados(p_token text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public._exige_login(p_token);

  RETURN COALESCE((
    SELECT json_agg(json_build_object('uf', e.uf, 'nome', e.nome) ORDER BY e.nome)
    FROM public.estados e
  ), '[]'::json);
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_cidades(p_token text, p_estado text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uf text;
BEGIN
  PERFORM public._exige_login(p_token);
  v_uf := upper(trim(COALESCE(p_estado, '')));
  IF v_uf = '' THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE((
    SELECT json_agg(json_build_object('nome', c.nome) ORDER BY c.nome)
    FROM public.cidades c
    WHERE c.uf = v_uf
  ), '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_estados(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listar_cidades(text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
`;

(async () => {
  const res = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado');
  if (!res.ok) throw new Error(`IBGE HTTP ${res.status}`);
  const mun = await res.json();
  const estados = new Map();
  const cidades = [];
  for (const m of mun) {
    const uf = String(m['UF-sigla'] || '').trim().toUpperCase();
    const ufNome = String(m['UF-nome'] || '').trim();
    const nome = String(m['municipio-nome'] || '').trim();
    const ibge = Number(m['municipio-id']);
    if (!uf || uf.length !== 2 || !nome) continue;
    estados.set(uf, ufNome || uf);
    cidades.push({ uf, nome, ibge: Number.isFinite(ibge) ? ibge : null });
  }

  const ufs = [...estados.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  let sql = DDL;
  sql += '\nINSERT INTO public.estados (uf, nome) VALUES\n';
  sql += ufs.map(([uf, nome]) => `  (${sqlStr(uf)}, ${sqlStr(nome)})`).join(',\n');
  sql += '\nON CONFLICT (uf) DO UPDATE SET nome = EXCLUDED.nome;\n\n';

  const chunk = 400;
  for (let i = 0; i < cidades.length; i += chunk) {
    const parte = cidades.slice(i, i + chunk);
    sql += 'INSERT INTO public.cidades (uf, nome, ibge_id) VALUES\n';
    sql += parte.map((c) => `  (${sqlStr(c.uf)}, ${sqlStr(c.nome)}, ${c.ibge == null ? 'NULL' : c.ibge})`).join(',\n');
    sql += '\nON CONFLICT (uf, nome) DO UPDATE SET ibge_id = COALESCE(EXCLUDED.ibge_id, public.cidades.ibge_id);\n\n';
  }

  sql += FUNCOES;
  fs.writeFileSync(OUT, sql);
  console.log(`Gerado ${OUT}`);
  console.log(`${ufs.length} estados, ${cidades.length} cidades.`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
