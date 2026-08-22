-- Pagamentos da folha: comprovante (foto), data e valor.
-- Rode no SQL Editor do Supabase.

ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS banco text;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS agencia text;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS conta text;

CREATE TABLE IF NOT EXISTS public.pagamentos_folha (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE RESTRICT,
  usuario_id      uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  data_pagamento  date NOT NULL DEFAULT CURRENT_DATE,
  valor           numeric(12,2) NOT NULL,
  comprovante     text NOT NULL,
  ocr_texto       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pagamentos_folha_valor_chk CHECK (valor >= 0),
  CONSTRAINT pagamentos_folha_comp_chk CHECK (length(comprovante) BETWEEN 32 AND 1500000)
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_folha_colaborador
  ON public.pagamentos_folha (colaborador_id, data_pagamento DESC);

ALTER TABLE public.pagamentos_folha ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pagamentos_folha FROM anon, authenticated;

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

CREATE OR REPLACE FUNCTION public.excluir_colaborador(p_token text, p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public._exige_admin(p_token);

  IF EXISTS (SELECT 1 FROM public.entregas WHERE colaborador_id = p_id) THEN
    RAISE EXCEPTION 'Este colaborador possui entregas e não pode ser excluído.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.pagamentos_folha WHERE colaborador_id = p_id) THEN
    RAISE EXCEPTION 'Este colaborador possui pagamentos da folha e não pode ser excluído.';
  END IF;

  DELETE FROM public.colaboradores WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Colaborador não encontrado.';
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

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

CREATE OR REPLACE FUNCTION public.salvar_pagamento_folha(
  p_token           text,
  p_colaborador_id  uuid,
  p_data_pagamento  date,
  p_valor           numeric,
  p_comprovante     text,
  p_ocr_texto       text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user public.usuarios;
  v_id   uuid;
  v_comp text;
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

  v_comp := trim(COALESCE(p_comprovante, ''));
  IF v_comp !~ '^data:image/(jpeg|jpg|png|webp);base64,' THEN
    RAISE EXCEPTION 'Anexe a foto do comprovante.';
  END IF;
  IF length(v_comp) < 32 OR length(v_comp) > 1500000 THEN
    RAISE EXCEPTION 'A foto do comprovante é inválida ou grande demais.';
  END IF;

  INSERT INTO public.pagamentos_folha (
    colaborador_id, usuario_id, data_pagamento, valor, comprovante, ocr_texto
  ) VALUES (
    p_colaborador_id,
    v_user.id,
    p_data_pagamento,
    round(p_valor, 2),
    v_comp,
    NULLIF(trim(COALESCE(p_ocr_texto, '')), '')
  )
  RETURNING id INTO v_id;

  RETURN json_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_pagamento_folha(p_token text, p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public._exige_admin(p_token);

  DELETE FROM public.pagamentos_folha
  WHERE id = p_id
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Pagamento não encontrado.';
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_colaboradores(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_colaborador(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listar_pagamentos_folha(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obter_pagamento_folha(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_pagamento_folha(text, uuid, date, numeric, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_pagamento_folha(text, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
