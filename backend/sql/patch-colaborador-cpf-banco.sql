-- CPF no colaborador. Com folha ativa: banco, agência e conta.
-- Rode no SQL Editor do Supabase.

ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS banco text;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS agencia text;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS conta text;

ALTER TABLE public.colaboradores DROP CONSTRAINT IF EXISTS colaboradores_cpf_chk;
ALTER TABLE public.colaboradores ADD CONSTRAINT colaboradores_cpf_chk
  CHECK (cpf IS NULL OR cpf ~ '^\d{11}$');

CREATE UNIQUE INDEX IF NOT EXISTS colaboradores_cpf_uidx
  ON public.colaboradores (cpf)
  WHERE cpf IS NOT NULL;

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
        id,
        nome,
        CASE WHEN v_user.tipo = 'admin' THEN cpf ELSE NULL END AS cpf,
        endereco,
        numero,
        complemento,
        bairro,
        cidade,
        estado,
        data_inicio,
        CASE WHEN v_user.tipo = 'admin' THEN folha ELSE NULL END AS folha,
        CASE WHEN v_user.tipo = 'admin' THEN valor_mensal ELSE NULL END AS valor_mensal,
        CASE WHEN v_user.tipo = 'admin' THEN banco ELSE NULL END AS banco,
        CASE WHEN v_user.tipo = 'admin' THEN agencia ELSE NULL END AS agencia,
        CASE WHEN v_user.tipo = 'admin' THEN conta ELSE NULL END AS conta
      FROM public.colaboradores
    ) t
  ), '[]'::json);
END;
$$;

DROP FUNCTION IF EXISTS public.salvar_colaborador(text, uuid, text, text, text, text, text, text, text, boolean, numeric, date);

CREATE OR REPLACE FUNCTION public.salvar_colaborador(
  p_token        text,
  p_id           uuid,
  p_nome         text,
  p_endereco     text,
  p_numero       text,
  p_complemento  text,
  p_bairro       text,
  p_cidade       text,
  p_estado       text,
  p_folha        boolean,
  p_valor_mensal numeric,
  p_data_inicio  date,
  p_cpf          text DEFAULT NULL,
  p_banco        text DEFAULT NULL,
  p_agencia      text DEFAULT NULL,
  p_conta        text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id      uuid;
  v_folha   boolean;
  v_valor   numeric;
  v_uf      text;
  v_cpf     text;
  v_banco   text;
  v_agencia text;
  v_conta   text;
BEGIN
  PERFORM public._exige_admin(p_token);

  v_folha := COALESCE(p_folha, false);
  v_valor := CASE WHEN v_folha THEN p_valor_mensal ELSE NULL END;
  v_uf    := CASE
    WHEN p_estado IS NULL OR trim(p_estado) = '' THEN NULL
    ELSE upper(trim(p_estado))
  END;
  v_cpf := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');
  v_cpf := CASE WHEN v_cpf = '' THEN NULL ELSE v_cpf END;

  IF v_cpf IS NOT NULL AND char_length(v_cpf) <> 11 THEN
    RAISE EXCEPTION 'Informe um CPF válido.';
  END IF;

  IF v_cpf IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.colaboradores
    WHERE cpf = v_cpf AND (p_id IS NULL OR id <> p_id)
  ) THEN
    RAISE EXCEPTION 'Já existe um colaborador com este CPF.';
  END IF;

  IF v_folha THEN
    v_banco   := lpad(regexp_replace(COALESCE(p_banco, ''), '\D', '', 'g'), 3, '0');
    v_agencia := nullif(trim(COALESCE(p_agencia, '')), '');
    v_conta   := nullif(trim(COALESCE(p_conta, '')), '');
    IF v_banco IS NULL OR char_length(v_banco) <> 3 OR v_banco = '000' THEN
      RAISE EXCEPTION 'Selecione o banco.';
    END IF;
    IF v_agencia IS NULL THEN
      RAISE EXCEPTION 'Informe a agência.';
    END IF;
    IF v_conta IS NULL THEN
      RAISE EXCEPTION 'Informe a conta.';
    END IF;
  ELSE
    v_banco := NULL;
    v_agencia := NULL;
    v_conta := NULL;
  END IF;

  IF v_folha AND (v_valor IS NULL OR v_valor < 0) THEN
    RAISE EXCEPTION 'Informe o valor mensal da folha.';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.colaboradores (
      nome, cpf, endereco, numero, complemento, bairro, cidade, estado,
      folha, valor_mensal, banco, agencia, conta, data_inicio
    ) VALUES (
      trim(p_nome), v_cpf, nullif(trim(p_endereco), ''), nullif(trim(p_numero), ''),
      nullif(trim(p_complemento), ''), nullif(trim(p_bairro), ''),
      nullif(trim(p_cidade), ''), v_uf,
      v_folha, v_valor, v_banco, v_agencia, v_conta, p_data_inicio
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.colaboradores SET
      nome = trim(p_nome),
      cpf = v_cpf,
      endereco = nullif(trim(p_endereco), ''),
      numero = nullif(trim(p_numero), ''),
      complemento = nullif(trim(p_complemento), ''),
      bairro = nullif(trim(p_bairro), ''),
      cidade = nullif(trim(p_cidade), ''),
      estado = v_uf,
      folha = v_folha,
      valor_mensal = v_valor,
      banco = v_banco,
      agencia = v_agencia,
      conta = v_conta,
      data_inicio = p_data_inicio
    WHERE id = p_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Colaborador não encontrado.';
    END IF;
  END IF;

  RETURN json_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_colaboradores(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_colaborador(text, uuid, text, text, text, text, text, text, text, boolean, numeric, date, text, text, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
