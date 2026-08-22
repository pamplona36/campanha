-- Relatório com filtro de status (p_status).
-- Corrige: Could not find the function public.relatorio_entregas(..., p_status, p_token)
-- Rode no SQL Editor do Supabase.

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

GRANT EXECUTE ON FUNCTION public.relatorio_entregas(text, uuid, text, date, date, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
