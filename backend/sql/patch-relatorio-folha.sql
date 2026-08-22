-- Folha de pagamento: período, pagos e em aberto.
-- Exige a tabela pagamentos_folha (rode antes patch-pagamentos-folha.sql).
-- Rode no SQL Editor do Supabase.

ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS banco text;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS agencia text;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS conta text;

CREATE OR REPLACE FUNCTION public.listar_colaboradores(p_token text)
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
    SELECT json_agg(row_to_json(t) ORDER BY t.nome)
    FROM (
      SELECT
        c.id,
        c.nome,
        CASE WHEN v_user.tipo = 'admin' THEN to_jsonb(c)->>'cpf' ELSE NULL END AS cpf,
        c.endereco,
        c.numero,
        c.complemento,
        c.bairro,
        c.cidade,
        c.estado,
        c.data_inicio,
        CASE WHEN v_user.tipo = 'admin' THEN c.folha ELSE NULL END AS folha,
        CASE WHEN v_user.tipo = 'admin' THEN c.valor_mensal ELSE NULL END AS valor_mensal,
        CASE WHEN v_user.tipo = 'admin' THEN to_jsonb(c)->>'banco' ELSE NULL END AS banco,
        CASE WHEN v_user.tipo = 'admin' THEN to_jsonb(c)->>'agencia' ELSE NULL END AS agencia,
        CASE WHEN v_user.tipo = 'admin' THEN to_jsonb(c)->>'conta' ELSE NULL END AS conta,
        CASE WHEN v_user.tipo = 'admin' THEN (
          SELECT MAX(p.data_pagamento)
          FROM public.pagamentos_folha p
          WHERE p.colaborador_id = c.id
        ) ELSE NULL END AS ultimo_pagamento
      FROM public.colaboradores c
    ) t
  ), '[]'::json);
END;
$$;

CREATE OR REPLACE FUNCTION public.relatorio_folha_pagamento(
  p_token     text,
  p_data_ini  date DEFAULT NULL,
  p_data_fim  date DEFAULT NULL,
  p_situacao  text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ini    date;
  v_fim    date;
  v_sit    text;
  v_itens  json;
  v_totais json;
BEGIN
  PERFORM public._exige_admin(p_token);

  v_ini := COALESCE(p_data_ini, date_trunc('month', CURRENT_DATE)::date);
  v_fim := COALESCE(
    p_data_fim,
    (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date
  );
  IF v_ini > v_fim THEN
    RAISE EXCEPTION 'A data inicial não pode ser maior que a data final.';
  END IF;

  v_sit := lower(nullif(trim(COALESCE(p_situacao, '')), ''));
  IF v_sit = 'todos' THEN
    v_sit := NULL;
  END IF;
  IF v_sit IS NOT NULL AND v_sit NOT IN ('pago', 'aberto') THEN
    RAISE EXCEPTION 'Situação inválida.';
  END IF;

  WITH base AS (
    SELECT
      c.id AS colaborador_id,
      c.nome AS colaborador_nome,
      to_jsonb(c)->>'cpf' AS cpf,
      to_jsonb(c)->>'banco' AS banco,
      to_jsonb(c)->>'agencia' AS agencia,
      to_jsonb(c)->>'conta' AS conta,
      c.valor_mensal AS valor_mensal,
      c.data_inicio AS data_inicio,
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', p.id,
          'data_pagamento', p.data_pagamento,
          'valor', p.valor,
          'usuario_nome', u.nome
        ) ORDER BY p.data_pagamento DESC, p.created_at DESC)
        FROM public.pagamentos_folha p
        JOIN public.usuarios u ON u.id = p.usuario_id
        WHERE p.colaborador_id = c.id
          AND p.data_pagamento BETWEEN v_ini AND v_fim
      ), '[]'::json) AS pagamentos,
      COALESCE((
        SELECT SUM(p.valor)
        FROM public.pagamentos_folha p
        WHERE p.colaborador_id = c.id
          AND p.data_pagamento BETWEEN v_ini AND v_fim
      ), 0) AS valor_pago,
      COALESCE((
        SELECT COUNT(*)::integer
        FROM public.pagamentos_folha p
        WHERE p.colaborador_id = c.id
          AND p.data_pagamento BETWEEN v_ini AND v_fim
      ), 0) AS qtd_pagamentos,
      (
        SELECT MAX(p.data_pagamento)
        FROM public.pagamentos_folha p
        WHERE p.colaborador_id = c.id
          AND p.data_pagamento BETWEEN v_ini AND v_fim
      ) AS ultima_data
    FROM public.colaboradores c
    WHERE c.folha = true
      AND (c.data_inicio IS NULL OR c.data_inicio <= v_fim)
  ),
  marcado AS (
    SELECT
      *,
      CASE WHEN qtd_pagamentos > 0 THEN 'pago' ELSE 'aberto' END AS situacao,
      CASE WHEN qtd_pagamentos > 0 THEN 0 ELSE COALESCE(valor_mensal, 0) END AS valor_aberto
    FROM base
  )
  SELECT
    COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY
        CASE t.situacao WHEN 'aberto' THEN 0 ELSE 1 END,
        t.colaborador_nome
      )
      FROM marcado t
      WHERE v_sit IS NULL OR t.situacao = v_sit
    ), '[]'::json),
    json_build_object(
      'periodo_ini', v_ini,
      'periodo_fim', v_fim,
      'colaboradores', COUNT(*)::integer,
      'pagos', COUNT(*) FILTER (WHERE situacao = 'pago')::integer,
      'abertos', COUNT(*) FILTER (WHERE situacao = 'aberto')::integer,
      'valor_folha', COALESCE(SUM(valor_mensal), 0),
      'valor_pago', COALESCE(SUM(valor_pago), 0),
      'valor_aberto', COALESCE(SUM(valor_aberto), 0)
    )
  INTO v_itens, v_totais
  FROM marcado;

  RETURN json_build_object(
    'ok', true,
    'itens', COALESCE(v_itens, '[]'::json),
    'totais', COALESCE(v_totais, json_build_object(
      'periodo_ini', v_ini,
      'periodo_fim', v_fim,
      'colaboradores', 0,
      'pagos', 0,
      'abertos', 0,
      'valor_folha', 0,
      'valor_pago', 0,
      'valor_aberto', 0
    ))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_colaboradores(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.relatorio_folha_pagamento(text, date, date, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
