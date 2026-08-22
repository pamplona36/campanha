-- Status da entrega: novo, entrega_iniciada, entregue, reagendado.
-- Rode no SQL Editor do Supabase.

DO $$ BEGIN
  CREATE TYPE public.status_entrega AS ENUM ('novo', 'entrega_iniciada', 'entregue', 'reagendado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'status_entrega'
      AND e.enumlabel = 'em_rota'
  ) THEN
    ALTER TYPE public.status_entrega RENAME VALUE 'em_rota' TO 'entrega_iniciada';
  END IF;
END $$;

ALTER TABLE public.entregas
  ADD COLUMN IF NOT EXISTS status public.status_entrega NOT NULL DEFAULT 'novo';

CREATE INDEX IF NOT EXISTS idx_entregas_status ON public.entregas (status);

CREATE OR REPLACE FUNCTION public.listar_entregas(p_token text, p_limite integer DEFAULT 80)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user public.usuarios;
BEGIN
  v_user := public._exige_login(p_token);

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
        e.status::text AS status,
        COALESCE((
          SELECT json_agg(json_build_object(
            'material_id', i.material_id,
            'material_nome', m.nome,
            'material_tipo', m.tipo,
            'quantidade', i.quantidade
          ) ORDER BY m.nome)
          FROM public.entrega_itens i
          JOIN public.materiais m ON m.id = i.material_id
          WHERE i.entrega_id = e.id
        ), '[]'::json) AS itens,
        COALESCE((
          SELECT SUM(i.quantidade)::integer
          FROM public.entrega_itens i
          WHERE i.entrega_id = e.id
        ), 0) AS quantidade,
        e.data_entrega,
        e.usuario_id,
        u.nome AS usuario_nome,
        COALESCE((
          SELECT string_agg(ue.nome, ', ' ORDER BY ue.nome)
          FROM public.entrega_entregadores ee
          JOIN public.usuarios ue ON ue.id = ee.usuario_id
          WHERE ee.entrega_id = e.id
        ), u.nome) AS entregadores_nomes,
        (v_user.tipo = 'admin'
          OR e.usuario_id = v_user.id
          OR EXISTS (
            SELECT 1 FROM public.entrega_entregadores ee2
            WHERE ee2.entrega_id = e.id AND ee2.usuario_id = v_user.id
          )
        ) AS pode_status,
        e.created_at
      FROM public.entregas e
      JOIN public.colaboradores c ON c.id = e.colaborador_id
      JOIN public.usuarios u ON u.id = e.usuario_id
      ORDER BY e.data_entrega DESC, e.created_at DESC
      LIMIT GREATEST(COALESCE(p_limite, 80), 1)
    ) t
  ), '[]'::json);
END;
$$;

DROP FUNCTION IF EXISTS public.salvar_entrega(text, uuid, text, date, uuid[], json);
DROP FUNCTION IF EXISTS public.salvar_entrega(text, uuid, text, date, uuid[], json, text);

CREATE OR REPLACE FUNCTION public.salvar_entrega(
  p_token           text,
  p_colaborador_id  uuid,
  p_quem_recebeu    text,
  p_data_entrega    date,
  p_entregadores    uuid[],
  p_itens           json,
  p_status          text DEFAULT 'novo'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user   public.usuarios;
  v_id     uuid;
  v_ids    uuid[];
  v_status public.status_entrega;
BEGIN
  v_user := public._exige_login(p_token);

  BEGIN
    v_status := COALESCE(NULLIF(trim(p_status), ''), 'novo')::public.status_entrega;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Status inválido.';
  END;

  IF p_itens IS NULL OR json_typeof(p_itens) <> 'array' OR json_array_length(p_itens) < 1 THEN
    RAISE EXCEPTION 'Inclua ao menos um material.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM json_to_recordset(p_itens) AS x(material_id uuid, quantidade integer)
    WHERE x.material_id IS NULL OR x.quantidade IS NULL OR x.quantidade < 1
  ) THEN
    RAISE EXCEPTION 'Informe material e quantidade válidos em cada item.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM json_to_recordset(p_itens) AS x(material_id uuid, quantidade integer)
    WHERE NOT EXISTS (SELECT 1 FROM public.materiais m WHERE m.id = x.material_id)
  ) THEN
    RAISE EXCEPTION 'Material não encontrado.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.colaboradores WHERE id = p_colaborador_id) THEN
    RAISE EXCEPTION 'Colaborador não encontrado.';
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
    colaborador_id, quem_recebeu, data_entrega, status, usuario_id
  ) VALUES (
    p_colaborador_id,
    NULLIF(trim(COALESCE(p_quem_recebeu, '')), ''),
    COALESCE(p_data_entrega, CURRENT_DATE),
    v_status,
    v_user.id
  )
  RETURNING id INTO v_id;

  INSERT INTO public.entrega_itens (entrega_id, material_id, quantidade)
  SELECT v_id, x.material_id, SUM(x.quantidade)::integer
  FROM json_to_recordset(p_itens) AS x(material_id uuid, quantidade integer)
  GROUP BY x.material_id;

  INSERT INTO public.entrega_entregadores (entrega_id, usuario_id)
  SELECT v_id, unnest(v_ids);

  RETURN json_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.atualizar_status_entrega(
  p_token   text,
  p_id      uuid,
  p_status  text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user   public.usuarios;
  v_status public.status_entrega;
  v_id     uuid;
BEGIN
  v_user := public._exige_login(p_token);

  BEGIN
    v_status := NULLIF(trim(p_status), '')::public.status_entrega;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Status inválido.';
  END;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Informe o status.';
  END IF;

  UPDATE public.entregas e
  SET status = v_status
  WHERE e.id = p_id
    AND (
      v_user.tipo = 'admin'
      OR e.usuario_id = v_user.id
      OR EXISTS (
        SELECT 1 FROM public.entrega_entregadores ee
        WHERE ee.entrega_id = e.id AND ee.usuario_id = v_user.id
      )
    )
  RETURNING e.id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Entrega não encontrada ou sem permissão para alterar o status.';
  END IF;

  RETURN json_build_object('ok', true, 'id', v_id, 'status', v_status::text);
END;
$$;

DROP FUNCTION IF EXISTS public.relatorio_entregas(text, uuid, text, date, date);
DROP FUNCTION IF EXISTS public.relatorio_entregas(text, uuid, text, date, date, text);

CREATE OR REPLACE FUNCTION public.relatorio_entregas(
  p_token           text,
  p_colaborador_id  uuid,
  p_tipo            text,
  p_data_ini        date,
  p_data_fim        date,
  p_status          text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_itens json;
  v_qtd   bigint;
  v_n     bigint;
  v_custo numeric;
  v_folha integer;
BEGIN
  PERFORM public._exige_admin(p_token);

  WITH filtrado AS (
    SELECT
      e.id,
      i.id AS item_id,
      e.colaborador_id,
      c.nome AS colaborador_nome,
      c.bairro AS colaborador_bairro,
      c.cidade AS colaborador_cidade,
      c.folha,
      c.valor_mensal,
      e.quem_recebeu,
      e.status::text AS status,
      i.material_id,
      m.nome AS material_nome,
      m.tipo AS material_tipo,
      i.quantidade,
      e.data_entrega,
      u.nome AS usuario_nome,
      COALESCE((
        SELECT string_agg(ue.nome, ', ' ORDER BY ue.nome)
        FROM public.entrega_entregadores ee
        JOIN public.usuarios ue ON ue.id = ee.usuario_id
        WHERE ee.entrega_id = e.id
      ), u.nome) AS entregadores_nomes
    FROM public.entregas e
    JOIN public.entrega_itens i ON i.entrega_id = e.id
    JOIN public.colaboradores c ON c.id = e.colaborador_id
    JOIN public.materiais m ON m.id = i.material_id
    JOIN public.usuarios u ON u.id = e.usuario_id
    WHERE (p_colaborador_id IS NULL OR e.colaborador_id = p_colaborador_id)
      AND (p_tipo IS NULL OR trim(p_tipo) = '' OR m.tipo = p_tipo)
      AND (p_status IS NULL OR trim(p_status) = '' OR e.status::text = p_status)
      AND (p_data_ini IS NULL OR e.data_entrega >= p_data_ini)
      AND (p_data_fim IS NULL OR e.data_entrega <= p_data_fim)
  )
  SELECT
    COALESCE((
      SELECT json_agg(row_to_json(x) ORDER BY x.data_entrega DESC, x.colaborador_nome)
      FROM (
        SELECT
          id, item_id, colaborador_id, colaborador_nome, colaborador_bairro, colaborador_cidade,
          quem_recebeu, status, material_id, material_nome, material_tipo,
          quantidade, data_entrega, usuario_nome, entregadores_nomes
        FROM filtrado
      ) x
    ), '[]'::json),
    COALESCE((SELECT SUM(quantidade) FROM filtrado), 0),
    COALESCE((SELECT COUNT(DISTINCT id) FROM filtrado), 0)
  INTO v_itens, v_qtd, v_n;

  SELECT
    COALESCE(SUM(valor_mensal), 0),
    COUNT(*)
  INTO v_custo, v_folha
  FROM (
    SELECT DISTINCT f.colaborador_id, c.valor_mensal
    FROM (
      SELECT e.colaborador_id
      FROM public.entregas e
      JOIN public.entrega_itens i ON i.entrega_id = e.id
      JOIN public.materiais m ON m.id = i.material_id
      WHERE (p_colaborador_id IS NULL OR e.colaborador_id = p_colaborador_id)
        AND (p_tipo IS NULL OR trim(p_tipo) = '' OR m.tipo = p_tipo)
        AND (p_status IS NULL OR trim(p_status) = '' OR e.status::text = p_status)
        AND (p_data_ini IS NULL OR e.data_entrega >= p_data_ini)
        AND (p_data_fim IS NULL OR e.data_entrega <= p_data_fim)
    ) f
    JOIN public.colaboradores c ON c.id = f.colaborador_id
    WHERE c.folha = true
  ) folha_ativa;

  IF p_colaborador_id IS NOT NULL AND v_n = 0 THEN
    SELECT
      CASE WHEN folha THEN COALESCE(valor_mensal, 0) ELSE 0 END,
      CASE WHEN folha THEN 1 ELSE 0 END
    INTO v_custo, v_folha
    FROM public.colaboradores
    WHERE id = p_colaborador_id;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'itens', v_itens,
    'totais', json_build_object(
      'quantidade', v_qtd,
      'entregas', v_n,
      'custo_folha', v_custo,
      'colaboradores_folha', v_folha
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.salvar_entrega(text, uuid, text, date, uuid[], json, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_status_entrega(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.relatorio_entregas(text, uuid, text, date, date, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
