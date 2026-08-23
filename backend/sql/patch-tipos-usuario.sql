-- Perfis de usuário: administrador, geral e motorista.
-- Rode no SQL Editor do Supabase em bancos já existentes.
-- Usuários com tipo antigo "usuario" passam a motorista.
-- Administrador: acesso total, inclusive Folha.
-- Geral: tudo menos Folha de pagamento.
-- Motorista: somente o menu Entregas.

ALTER TABLE public.usuarios ALTER COLUMN tipo DROP DEFAULT;
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_tipo_chk;

ALTER TABLE public.usuarios
  ALTER COLUMN tipo TYPE text USING (
    CASE
      WHEN tipo::text IN ('usuario', 'motorista') THEN 'motorista'
      WHEN tipo::text = 'geral' THEN 'geral'
      WHEN tipo::text = 'admin' THEN 'admin'
      ELSE 'motorista'
    END
  );

UPDATE public.usuarios SET tipo = 'motorista' WHERE tipo NOT IN ('admin', 'geral', 'motorista');

ALTER TABLE public.usuarios ALTER COLUMN tipo SET DEFAULT 'motorista';
ALTER TABLE public.usuarios ALTER COLUMN tipo SET NOT NULL;
ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_tipo_chk CHECK (tipo IN ('admin', 'geral', 'motorista'));

CREATE OR REPLACE FUNCTION public._eh_gestao(p_tipo text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_tipo IN ('admin', 'geral');
$$;

CREATE OR REPLACE FUNCTION public._exige_gestao(p_token text)
RETURNS public.usuarios
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user public.usuarios;
BEGIN
  v_user := public._exige_login(p_token);
  IF NOT public._eh_gestao(v_user.tipo::text) THEN
    RAISE EXCEPTION 'Acesso restrito.';
  END IF;
  RETURN v_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_usuarios(p_token text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public._exige_gestao(p_token);

  RETURN COALESCE((
    SELECT json_agg(row_to_json(t) ORDER BY t.nome)
    FROM (
      SELECT id, nome, login, tipo::text AS tipo, created_at
      FROM public.usuarios
    ) t
  ), '[]'::json);
END;
$$;

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

CREATE OR REPLACE FUNCTION public.salvar_usuario(
  p_token text,
  p_id    uuid,
  p_nome  text,
  p_login text,
  p_senha text,
  p_tipo  text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_editor     public.usuarios;
  v_id         uuid;
  v_tipo       text;
  v_atual_tipo text;
BEGIN
  v_editor := public._exige_gestao(p_token);

  v_tipo := lower(trim(COALESCE(p_tipo, '')));
  IF v_tipo = 'usuario' THEN
    v_tipo := 'motorista';
  END IF;
  IF v_tipo NOT IN ('admin', 'geral', 'motorista') THEN
    RAISE EXCEPTION 'Tipo de usuário inválido.';
  END IF;
  IF v_tipo = 'admin' AND v_editor.tipo::text <> 'admin' THEN
    RAISE EXCEPTION 'Somente o administrador pode cadastrar outro administrador.';
  END IF;

  IF p_id IS NULL THEN
    IF p_senha IS NULL OR length(p_senha) < 6 THEN
      RAISE EXCEPTION 'A senha deve ter no mínimo 6 caracteres.';
    END IF;

    INSERT INTO public.usuarios (nome, login, senha_hash, tipo)
    VALUES (trim(p_nome), lower(trim(p_login)), extensions.crypt(p_senha, extensions.gen_salt('bf')), v_tipo)
    RETURNING id INTO v_id;
  ELSE
    SELECT tipo::text INTO v_atual_tipo FROM public.usuarios WHERE id = p_id;
    IF v_atual_tipo = 'admin' AND v_editor.tipo::text <> 'admin' THEN
      RAISE EXCEPTION 'Somente o administrador pode alterar um administrador.';
    END IF;
    IF p_id = v_editor.id AND v_tipo <> v_editor.tipo::text THEN
      RAISE EXCEPTION 'Você não pode alterar o próprio tipo de acesso.';
    END IF;

    UPDATE public.usuarios
    SET nome  = trim(p_nome),
        login = lower(trim(p_login)),
        tipo  = v_tipo,
        senha_hash = CASE
          WHEN p_senha IS NOT NULL AND length(p_senha) >= 6
            THEN extensions.crypt(p_senha, extensions.gen_salt('bf'))
          ELSE senha_hash
        END
    WHERE id = p_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Usuário não encontrado.';
    END IF;
  END IF;

  RETURN json_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_usuario(p_token text, p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_editor     public.usuarios;
  v_atual_tipo text;
BEGIN
  v_editor := public._exige_gestao(p_token);

  IF p_id = v_editor.id THEN
    RAISE EXCEPTION 'Você não pode excluir o próprio usuário.';
  END IF;

  SELECT tipo::text INTO v_atual_tipo FROM public.usuarios WHERE id = p_id;
  IF v_atual_tipo = 'admin' AND v_editor.tipo::text <> 'admin' THEN
    RAISE EXCEPTION 'Somente o administrador pode excluir outro administrador.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.entregas WHERE usuario_id = p_id) THEN
    RAISE EXCEPTION 'Este usuário possui entregas registradas e não pode ser excluído.';
  END IF;

  DELETE FROM public.usuarios WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado.';
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

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
        CASE WHEN public._eh_gestao(v_user.tipo::text) THEN to_jsonb(c)->>'cpf' ELSE NULL END AS cpf,
        c.telefone,
        c.endereco,
        c.numero,
        c.complemento,
        c.bairro,
        c.cidade,
        c.estado,
        c.data_inicio,
        CASE WHEN public._eh_gestao(v_user.tipo::text) THEN c.folha ELSE NULL END AS folha,
        CASE WHEN public._eh_gestao(v_user.tipo::text) THEN c.valor_mensal ELSE NULL END AS valor_mensal,
        CASE WHEN public._eh_gestao(v_user.tipo::text) THEN to_jsonb(c)->>'banco' ELSE NULL END AS banco,
        CASE WHEN public._eh_gestao(v_user.tipo::text) THEN to_jsonb(c)->>'agencia' ELSE NULL END AS agencia,
        CASE WHEN public._eh_gestao(v_user.tipo::text) THEN to_jsonb(c)->>'conta' ELSE NULL END AS conta,
        CASE WHEN public._eh_gestao(v_user.tipo::text) THEN (
          SELECT MAX(p.data_pagamento)
          FROM public.pagamentos_folha p
          WHERE p.colaborador_id = c.id
        ) ELSE NULL END AS ultimo_pagamento
      FROM public.colaboradores c
    ) t
  ), '[]'::json);
END;
$$;

DROP FUNCTION IF EXISTS public.salvar_colaborador(text, uuid, text, text, text, text, text, text, text, boolean, numeric, date);
DROP FUNCTION IF EXISTS public.salvar_colaborador(text, uuid, text, text, text, text, text, text, text, boolean, numeric, date, text, text, text, text);

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
  p_conta        text DEFAULT NULL,
  p_telefone     text DEFAULT NULL
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
  v_tel     text;
  v_banco   text;
  v_agencia text;
  v_conta   text;
BEGIN
  PERFORM public._exige_gestao(p_token);

  v_folha := COALESCE(p_folha, false);
  v_valor := CASE WHEN v_folha THEN p_valor_mensal ELSE NULL END;
  v_uf    := CASE
    WHEN p_estado IS NULL OR trim(p_estado) = '' THEN NULL
    ELSE upper(trim(p_estado))
  END;
  v_cpf := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');
  v_cpf := CASE WHEN v_cpf = '' THEN NULL ELSE v_cpf END;
  v_tel := regexp_replace(COALESCE(p_telefone, ''), '\D', '', 'g');
  v_tel := CASE WHEN v_tel = '' THEN NULL ELSE v_tel END;

  IF v_cpf IS NOT NULL AND char_length(v_cpf) <> 11 THEN
    RAISE EXCEPTION 'Informe um CPF válido.';
  END IF;

  IF v_tel IS NOT NULL AND char_length(v_tel) NOT BETWEEN 10 AND 11 THEN
    RAISE EXCEPTION 'Informe um telefone válido com DDD.';
  END IF;

  IF v_cpf IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.colaboradores
    WHERE cpf = v_cpf AND (p_id IS NULL OR id <> p_id)
  ) THEN
    RAISE EXCEPTION 'Já existe um colaborador com este CPF.';
  END IF;

  IF v_folha THEN
    v_banco := regexp_replace(COALESCE(p_banco, ''), '\D', '', 'g');
    v_banco := CASE WHEN v_banco = '' THEN NULL ELSE lpad(v_banco, 3, '0') END;
    v_agencia := nullif(trim(COALESCE(p_agencia, '')), '');
    v_conta   := nullif(trim(COALESCE(p_conta, '')), '');
    IF v_banco IS NOT NULL AND (char_length(v_banco) <> 3 OR v_banco = '000') THEN
      RAISE EXCEPTION 'Selecione um banco válido.';
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
      nome, cpf, telefone, endereco, numero, complemento, bairro, cidade, estado,
      folha, valor_mensal, banco, agencia, conta, data_inicio
    ) VALUES (
      trim(p_nome), v_cpf, v_tel, nullif(trim(p_endereco), ''), nullif(trim(p_numero), ''),
      nullif(trim(p_complemento), ''), nullif(trim(p_bairro), ''),
      nullif(trim(p_cidade), ''), v_uf,
      v_folha, v_valor, v_banco, v_agencia, v_conta, p_data_inicio
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.colaboradores SET
      nome = trim(p_nome),
      cpf = v_cpf,
      telefone = v_tel,
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

CREATE OR REPLACE FUNCTION public.excluir_colaborador(p_token text, p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public._exige_gestao(p_token);

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

CREATE OR REPLACE FUNCTION public.salvar_tipo(
  p_token text,
  p_id    uuid,
  p_nome  text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public._exige_gestao(p_token);

  IF p_id IS NULL THEN
    INSERT INTO public.tipos_material (nome)
    VALUES (trim(p_nome))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.tipos_material
    SET nome = trim(p_nome)
    WHERE id = p_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Tipo não encontrado.';
    END IF;
  END IF;

  RETURN json_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_tipo(p_token text, p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_nome text;
BEGIN
  PERFORM public._exige_gestao(p_token);

  SELECT nome INTO v_nome FROM public.tipos_material WHERE id = p_id;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Tipo não encontrado.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.materiais WHERE tipo = v_nome) THEN
    RAISE EXCEPTION 'Este tipo está em uso por materiais e não pode ser excluído.';
  END IF;

  DELETE FROM public.tipos_material WHERE id = p_id;
  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_material(
  p_token text,
  p_id    uuid,
  p_nome  text,
  p_tipo  text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public._exige_gestao(p_token);

  IF NOT EXISTS (SELECT 1 FROM public.tipos_material WHERE nome = trim(p_tipo)) THEN
    RAISE EXCEPTION 'Tipo de material inválido.';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.materiais (nome, tipo)
    VALUES (trim(p_nome), trim(p_tipo))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.materiais
    SET nome = trim(p_nome),
        tipo = trim(p_tipo)
    WHERE id = p_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Material não encontrado.';
    END IF;
  END IF;

  RETURN json_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_material(p_token text, p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public._exige_gestao(p_token);

  IF EXISTS (SELECT 1 FROM public.entrega_itens WHERE material_id = p_id) THEN
    RAISE EXCEPTION 'Este material possui entregas e não pode ser excluído.';
  END IF;

  DELETE FROM public.materiais WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material não encontrado.';
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_entregas(p_token text, p_limite integer DEFAULT 200)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user public.usuarios;
  v_admin boolean;
BEGIN
  v_user := public._exige_login(p_token);
  v_admin := public._eh_gestao(v_user.tipo::text);

  RETURN COALESCE((
    SELECT json_agg(row_to_json(t) ORDER BY t.data_entrega DESC, t.created_at DESC)
    FROM (
      SELECT
        e.id,
        e.colaborador_id,
        c.nome AS colaborador_nome,
        to_jsonb(c)->>'telefone' AS colaborador_telefone,
        c.endereco AS colaborador_endereco,
        c.numero AS colaborador_numero,
        c.complemento AS colaborador_complemento,
        c.bairro AS colaborador_bairro,
        c.cidade AS colaborador_cidade,
        c.estado AS colaborador_estado,
        COALESCE(e.usa_endereco_colaborador, true) AS usa_endereco_colaborador,
        e.endereco,
        e.numero,
        e.complemento,
        e.bairro,
        e.cidade,
        e.estado,
        e.quem_recebeu,
        e.observacoes,
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
        COALESCE((
          SELECT json_agg(ee4.usuario_id)
          FROM public.entrega_entregadores ee4
          WHERE ee4.entrega_id = e.id
        ), '[]'::json) AS entregador_ids,
        (
          v_admin
          OR EXISTS (
            SELECT 1 FROM public.entrega_entregadores ee2
            WHERE ee2.entrega_id = e.id AND ee2.usuario_id = v_user.id
          )
        ) AS pode_status,
        (
          e.status::text <> 'entregue'
          AND (
            v_admin
            OR EXISTS (
              SELECT 1 FROM public.entrega_entregadores ee5
              WHERE ee5.entrega_id = e.id AND ee5.usuario_id = v_user.id
            )
          )
        ) AS pode_editar,
        e.created_at
      FROM public.entregas e
      JOIN public.colaboradores c ON c.id = e.colaborador_id
      JOIN public.usuarios u ON u.id = e.usuario_id
      ORDER BY e.data_entrega DESC, e.created_at DESC
      LIMIT GREATEST(COALESCE(p_limite, 10000), 1)
    ) t
  ), '[]'::json);
END;
$$;

DROP FUNCTION IF EXISTS public.salvar_entrega(text, uuid, text, uuid, integer, date);
DROP FUNCTION IF EXISTS public.salvar_entrega(text, uuid, text, uuid, integer, date, uuid[]);
DROP FUNCTION IF EXISTS public.salvar_entrega(text, uuid, text, date, uuid[], json);
DROP FUNCTION IF EXISTS public.salvar_entrega(text, uuid, text, date, uuid[], json, text);

DROP FUNCTION IF EXISTS public.salvar_entrega(text, uuid, text, date, uuid[], json, text, uuid);
DROP FUNCTION IF EXISTS public.salvar_entrega(text, uuid, text, date, uuid[], json, text, uuid, boolean, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.salvar_entrega(
  p_token           text,
  p_colaborador_id  uuid,
  p_quem_recebeu    text,
  p_data_entrega    date,
  p_entregadores    uuid[],
  p_itens           json,
  p_status          text DEFAULT 'novo',
  p_id              uuid DEFAULT NULL,
  p_usa_endereco_colaborador boolean DEFAULT true,
  p_endereco        text DEFAULT NULL,
  p_numero          text DEFAULT NULL,
  p_complemento     text DEFAULT NULL,
  p_bairro          text DEFAULT NULL,
  p_cidade          text DEFAULT NULL,
  p_estado          text DEFAULT NULL,
  p_observacoes     text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user     public.usuarios;
  v_id       uuid;
  v_ids      uuid[];
  v_status   public.status_entrega;
  v_atual    public.entregas;
  v_admin    boolean;
  v_pode     boolean;
  v_usa_colab boolean;
  v_end      text;
  v_num      text;
  v_comp     text;
  v_bairro   text;
  v_cidade   text;
  v_uf       text;
  v_obs      text;
  v_col      public.colaboradores;
BEGIN
  v_user := public._exige_login(p_token);
  v_admin := public._eh_gestao(v_user.tipo::text);

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

  SELECT * INTO v_col FROM public.colaboradores WHERE id = p_colaborador_id;
  v_usa_colab := COALESCE(p_usa_endereco_colaborador, true);
  IF v_usa_colab THEN
    v_end    := v_col.endereco;
    v_num    := v_col.numero;
    v_comp   := v_col.complemento;
    v_bairro := v_col.bairro;
    v_cidade := v_col.cidade;
    v_uf     := v_col.estado;
  ELSE
    v_end    := nullif(trim(COALESCE(p_endereco, '')), '');
    v_num    := nullif(trim(COALESCE(p_numero, '')), '');
    v_comp   := nullif(trim(COALESCE(p_complemento, '')), '');
    v_bairro := nullif(trim(COALESCE(p_bairro, '')), '');
    v_cidade := nullif(trim(COALESCE(p_cidade, '')), '');
    v_uf     := CASE
      WHEN p_estado IS NULL OR trim(p_estado) = '' THEN NULL
      ELSE upper(trim(p_estado))
    END;
    IF v_end IS NULL AND v_cidade IS NULL THEN
      RAISE EXCEPTION 'Informe o endereço da entrega.';
    END IF;
  END IF;

  v_obs := NULLIF(trim(COALESCE(p_observacoes, '')), '');
  IF v_obs IS NOT NULL AND char_length(v_obs) > 2000 THEN
    RAISE EXCEPTION 'As observações podem ter no máximo 2000 caracteres.';
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

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_atual FROM public.entregas WHERE id = p_id;
    IF v_atual.id IS NULL THEN
      RAISE EXCEPTION 'Entrega não encontrada.';
    END IF;
    IF v_atual.status::text = 'entregue' THEN
      RAISE EXCEPTION 'Entrega já concluída não pode ser editada.';
    END IF;
    v_pode := v_admin
      OR EXISTS (
        SELECT 1 FROM public.entrega_entregadores ee
        WHERE ee.entrega_id = v_atual.id AND ee.usuario_id = v_user.id
      );
    IF NOT v_pode THEN
      RAISE EXCEPTION 'Somente quem está em Quem entregou pode alterar esta entrega.';
    END IF;
    IF NOT v_admin THEN
      v_status := v_atual.status;
    END IF;

    UPDATE public.entregas SET
      colaborador_id = p_colaborador_id,
      quem_recebeu = NULLIF(trim(COALESCE(p_quem_recebeu, '')), ''),
      data_entrega = COALESCE(p_data_entrega, v_atual.data_entrega),
      status = v_status,
      usa_endereco_colaborador = v_usa_colab,
      endereco = v_end,
      numero = v_num,
      complemento = v_comp,
      bairro = v_bairro,
      cidade = v_cidade,
      estado = v_uf,
      observacoes = v_obs
    WHERE id = p_id
    RETURNING id INTO v_id;

    DELETE FROM public.entrega_itens WHERE entrega_id = v_id;
    DELETE FROM public.entrega_entregadores WHERE entrega_id = v_id;
  ELSE
    INSERT INTO public.entregas (
      colaborador_id, quem_recebeu, data_entrega, status, usuario_id,
      usa_endereco_colaborador, endereco, numero, complemento, bairro, cidade, estado,
      observacoes
    ) VALUES (
      p_colaborador_id,
      NULLIF(trim(COALESCE(p_quem_recebeu, '')), ''),
      COALESCE(p_data_entrega, CURRENT_DATE),
      v_status,
      v_user.id,
      v_usa_colab, v_end, v_num, v_comp, v_bairro, v_cidade, v_uf,
      v_obs
    )
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.entrega_itens (entrega_id, material_id, quantidade)
  SELECT v_id, x.material_id, SUM(x.quantidade)::integer
  FROM json_to_recordset(p_itens) AS x(material_id uuid, quantidade integer)
  GROUP BY x.material_id;

  INSERT INTO public.entrega_entregadores (entrega_id, usuario_id)
  SELECT v_id, unnest(v_ids);

  RETURN json_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_entrega(p_token text, p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public._exige_gestao(p_token);

  DELETE FROM public.entregas
  WHERE id = p_id
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Entrega não encontrada.';
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

DROP FUNCTION IF EXISTS public.atualizar_status_entrega(text, uuid, text);
DROP FUNCTION IF EXISTS public.atualizar_status_entrega(text, uuid, text, date);

CREATE OR REPLACE FUNCTION public.atualizar_status_entrega(
  p_token          text,
  p_id             uuid,
  p_status         text,
  p_data_entrega   date DEFAULT NULL
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
  SET
    status = v_status,
    data_entrega = COALESCE(p_data_entrega, e.data_entrega)
  WHERE e.id = p_id
    AND (
      public._eh_gestao(v_user.tipo::text)
      OR EXISTS (
        SELECT 1 FROM public.entrega_entregadores ee
        WHERE ee.entrega_id = e.id AND ee.usuario_id = v_user.id
      )
    )
  RETURNING e.id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Somente quem está em Quem entregou pode alterar o status.';
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
  PERFORM public._exige_gestao(p_token);

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

  -- Se o filtro apontar um colaborador específico sem entregas no período,
  -- ainda assim considera a folha dele quando estiver ativo na folha.
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

REVOKE EXECUTE ON FUNCTION public._exige_gestao(text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public._eh_gestao(text) FROM anon, authenticated, public;

DO $$
BEGIN
  DROP TYPE IF EXISTS public.tipo_perfil;
EXCEPTION
  WHEN dependent_objects_still_exist THEN NULL;
END;
$$;

NOTIFY pgrst, 'reload schema';
