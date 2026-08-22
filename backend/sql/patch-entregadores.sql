-- Rode no SQL Editor do Supabase (banco já existente).
CREATE TABLE IF NOT EXISTS public.entrega_entregadores (
  entrega_id  uuid NOT NULL REFERENCES public.entregas(id) ON DELETE CASCADE,
  usuario_id  uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  PRIMARY KEY (entrega_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_entrega_entregadores_usuario ON public.entrega_entregadores (usuario_id);

ALTER TABLE public.entrega_entregadores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.entrega_entregadores FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.listar_equipe(p_token text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public._exige_login(p_token);

  RETURN COALESCE((
    SELECT json_agg(row_to_json(t) ORDER BY t.nome)
    FROM (
      SELECT id, nome FROM public.usuarios
    ) t
  ), '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_equipe(text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.salvar_entrega(text, uuid, text, uuid, integer, date);

CREATE OR REPLACE FUNCTION public.salvar_entrega(
  p_token           text,
  p_colaborador_id  uuid,
  p_quem_recebeu    text,
  p_material_id     uuid,
  p_quantidade      integer,
  p_data_entrega    date,
  p_entregadores    uuid[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user public.usuarios;
  v_id   uuid;
  v_ids  uuid[];
BEGIN
  v_user := public._exige_login(p_token);

  IF p_quantidade IS NULL OR p_quantidade < 1 THEN
    RAISE EXCEPTION 'Informe uma quantidade válida.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.colaboradores WHERE id = p_colaborador_id) THEN
    RAISE EXCEPTION 'Colaborador não encontrado.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.materiais WHERE id = p_material_id) THEN
    RAISE EXCEPTION 'Material não encontrado.';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT x
    FROM unnest(COALESCE(p_entregadores, ARRAY[v_user.id])) AS x
    WHERE x IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = x)
  ) INTO v_ids;

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    v_ids := ARRAY[v_user.id];
  END IF;

  INSERT INTO public.entregas (
    colaborador_id, quem_recebeu, material_id, quantidade, data_entrega, usuario_id
  ) VALUES (
    p_colaborador_id,
    trim(p_quem_recebeu),
    p_material_id,
    p_quantidade,
    COALESCE(p_data_entrega, CURRENT_DATE),
    v_user.id
  )
  RETURNING id INTO v_id;

  INSERT INTO public.entrega_entregadores (entrega_id, usuario_id)
  SELECT v_id, unnest(v_ids);

  RETURN json_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.salvar_entrega(text, uuid, text, uuid, integer, date, uuid[]) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.listar_entregas(p_token text, p_limite integer DEFAULT 80)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public._exige_login(p_token);

  RETURN COALESCE((
    SELECT json_agg(row_to_json(t) ORDER BY t.data_entrega DESC, t.created_at DESC)
    FROM (
      SELECT
        e.id,
        e.colaborador_id,
        c.nome AS colaborador_nome,
        c.bairro AS colaborador_bairro,
        c.cidade AS colaborador_cidade,
        e.quem_recebeu,
        e.material_id,
        m.nome AS material_nome,
        m.tipo AS material_tipo,
        e.quantidade,
        e.data_entrega,
        e.usuario_id,
        u.nome AS usuario_nome,
        COALESCE((
          SELECT string_agg(ue.nome, ', ' ORDER BY ue.nome)
          FROM public.entrega_entregadores ee
          JOIN public.usuarios ue ON ue.id = ee.usuario_id
          WHERE ee.entrega_id = e.id
        ), u.nome) AS entregadores_nomes,
        e.created_at
      FROM public.entregas e
      JOIN public.colaboradores c ON c.id = e.colaborador_id
      JOIN public.materiais m ON m.id = e.material_id
      JOIN public.usuarios u ON u.id = e.usuario_id
      ORDER BY e.data_entrega DESC, e.created_at DESC
      LIMIT GREATEST(COALESCE(p_limite, 80), 1)
    ) t
  ), '[]'::json);
END;
$$;

NOTIFY pgrst, 'reload schema';
