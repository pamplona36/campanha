-- Comprovante opcional e forma do pagamento: dinheiro, depósito ou PIX.
-- Rode no SQL Editor do Supabase.

ALTER TABLE public.pagamentos_folha ADD COLUMN IF NOT EXISTS forma text;
UPDATE public.pagamentos_folha SET forma = 'pix' WHERE forma IS NULL OR trim(forma) = '';
ALTER TABLE public.pagamentos_folha ALTER COLUMN forma SET DEFAULT 'pix';
ALTER TABLE public.pagamentos_folha ALTER COLUMN forma SET NOT NULL;

ALTER TABLE public.pagamentos_folha ALTER COLUMN comprovante DROP NOT NULL;

ALTER TABLE public.pagamentos_folha DROP CONSTRAINT IF EXISTS pagamentos_folha_forma_chk;
ALTER TABLE public.pagamentos_folha ADD CONSTRAINT pagamentos_folha_forma_chk
  CHECK (forma IN ('dinheiro', 'deposito', 'pix'));

ALTER TABLE public.pagamentos_folha DROP CONSTRAINT IF EXISTS pagamentos_folha_comp_chk;
ALTER TABLE public.pagamentos_folha ADD CONSTRAINT pagamentos_folha_comp_chk
  CHECK (comprovante IS NULL OR length(comprovante) BETWEEN 32 AND 1500000);

CREATE OR REPLACE FUNCTION public.listar_pagamentos_folha(p_token text, p_colaborador_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public._exige_admin(p_token);

  IF NOT EXISTS (SELECT 1 FROM public.colaboradores WHERE id = p_colaborador_id) THEN
    RAISE EXCEPTION 'Colaborador não encontrado.';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(t) ORDER BY t.data_pagamento DESC, t.created_at DESC)
    FROM (
      SELECT
        p.id,
        p.colaborador_id,
        p.data_pagamento,
        p.valor,
        p.forma,
        (p.comprovante IS NOT NULL AND length(trim(p.comprovante)) >= 32) AS tem_comprovante,
        p.usuario_id,
        u.nome AS usuario_nome,
        p.created_at
      FROM public.pagamentos_folha p
      JOIN public.usuarios u ON u.id = p.usuario_id
      WHERE p.colaborador_id = p_colaborador_id
    ) t
  ), '[]'::json);
END;
$$;

CREATE OR REPLACE FUNCTION public.obter_pagamento_folha(p_token text, p_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row json;
BEGIN
  PERFORM public._exige_admin(p_token);

  SELECT row_to_json(t) INTO v_row
  FROM (
    SELECT
      p.id,
      p.colaborador_id,
      p.data_pagamento,
      p.valor,
      p.forma,
      p.comprovante,
      p.usuario_id,
      u.nome AS usuario_nome,
      p.created_at
    FROM public.pagamentos_folha p
    JOIN public.usuarios u ON u.id = p.usuario_id
    WHERE p.id = p_id
  ) t;

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'Pagamento não encontrado.';
  END IF;

  RETURN v_row;
END;
$$;

DROP FUNCTION IF EXISTS public.salvar_pagamento_folha(text, uuid, date, numeric, text, text);

CREATE OR REPLACE FUNCTION public.salvar_pagamento_folha(
  p_token           text,
  p_colaborador_id  uuid,
  p_data_pagamento  date,
  p_valor           numeric,
  p_forma           text,
  p_comprovante     text DEFAULT NULL,
  p_ocr_texto       text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user  public.usuarios;
  v_id    uuid;
  v_comp  text;
  v_forma text;
BEGIN
  v_user := public._exige_admin(p_token);

  IF NOT EXISTS (
    SELECT 1 FROM public.colaboradores c
    WHERE c.id = p_colaborador_id AND c.folha = true
  ) THEN
    RAISE EXCEPTION 'Colaborador não está na folha.';
  END IF;

  IF p_data_pagamento IS NULL THEN
    RAISE EXCEPTION 'Informe a data do pagamento.';
  END IF;

  IF p_valor IS NULL OR p_valor < 0 THEN
    RAISE EXCEPTION 'Informe o valor do pagamento.';
  END IF;

  v_forma := lower(trim(COALESCE(p_forma, '')));
  IF v_forma NOT IN ('dinheiro', 'deposito', 'pix') THEN
    RAISE EXCEPTION 'Informe a forma de pagamento.';
  END IF;

  v_comp := nullif(trim(COALESCE(p_comprovante, '')), '');
  IF v_comp IS NOT NULL THEN
    IF v_comp !~ '^data:image/(jpeg|jpg|png|webp);base64,' THEN
      RAISE EXCEPTION 'A foto do comprovante é inválida.';
    END IF;
    IF length(v_comp) < 32 OR length(v_comp) > 1500000 THEN
      RAISE EXCEPTION 'A foto do comprovante é inválida ou grande demais.';
    END IF;
  END IF;

  INSERT INTO public.pagamentos_folha (
    colaborador_id, usuario_id, data_pagamento, valor, forma, comprovante, ocr_texto
  ) VALUES (
    p_colaborador_id,
    v_user.id,
    p_data_pagamento,
    round(p_valor, 2),
    v_forma,
    v_comp,
    NULLIF(trim(COALESCE(p_ocr_texto, '')), '')
  )
  RETURNING id INTO v_id;

  RETURN json_build_object('ok', true, 'id', v_id);
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
          'forma', to_jsonb(p)->>'forma',
          'tem_comprovante', (p.comprovante IS NOT NULL AND length(trim(p.comprovante)) >= 32),
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

GRANT EXECUTE ON FUNCTION public.listar_pagamentos_folha(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obter_pagamento_folha(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_pagamento_folha(text, uuid, date, numeric, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.relatorio_folha_pagamento(text, date, date, text) TO anon, authenticated;
