-- Observações no cadastro de entrega (opcional, até 2000 caracteres).
-- Rode no SQL Editor do Supabase.

ALTER TABLE public.entregas ADD COLUMN IF NOT EXISTS observacoes text;
ALTER TABLE public.entregas DROP CONSTRAINT IF EXISTS entregas_observacoes_chk;
ALTER TABLE public.entregas ADD CONSTRAINT entregas_observacoes_chk
  CHECK (observacoes IS NULL OR char_length(observacoes) <= 2000);

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
  v_admin := (v_user.tipo::text = 'admin');

  RETURN COALESCE((
    SELECT json_agg(row_to_json(t) ORDER BY t.data_entrega DESC, t.created_at DESC)
    FROM (
      SELECT
        e.id,
        e.colaborador_id,
        c.nome AS colaborador_nome,
        c.endereco AS colaborador_endereco,
        c.numero AS colaborador_numero,
        c.complemento AS colaborador_complemento,
        c.bairro AS colaborador_bairro,
        c.cidade AS colaborador_cidade,
        c.estado AS colaborador_estado,
        COALESCE(e.usa_endereco_colaborador, true) AS usa_endereco_colaborador,
        COALESCE(e.endereco, c.endereco) AS endereco,
        COALESCE(e.numero, c.numero) AS numero,
        COALESCE(e.complemento, c.complemento) AS complemento,
        COALESCE(e.bairro, c.bairro) AS bairro,
        COALESCE(e.cidade, c.cidade) AS cidade,
        COALESCE(e.estado, c.estado) AS estado,
        e.quem_recebeu,
        to_jsonb(e)->>'observacoes' AS observacoes,
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
        (v_admin
          OR e.usuario_id = v_user.id
          OR EXISTS (
            SELECT 1 FROM public.entrega_entregadores ee2
            WHERE ee2.entrega_id = e.id AND ee2.usuario_id = v_user.id
          )
        ) AS pode_status,
        (
          e.status::text <> 'entregue'
          AND (
            v_admin
            OR e.usuario_id = v_user.id
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
      WHERE v_admin
        OR e.usuario_id = v_user.id
        OR EXISTS (
          SELECT 1 FROM public.entrega_entregadores ee3
          WHERE ee3.entrega_id = e.id AND ee3.usuario_id = v_user.id
        )
      ORDER BY e.data_entrega DESC, e.created_at DESC
      LIMIT CASE
        WHEN v_admin THEN GREATEST(COALESCE(p_limite, 10000), 1)
        ELSE GREATEST(COALESCE(p_limite, 200), 1)
      END
    ) t
  ), '[]'::json);
END;
$$;

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
  v_admin := (v_user.tipo::text = 'admin');

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
      OR v_atual.usuario_id = v_user.id
      OR EXISTS (
        SELECT 1 FROM public.entrega_entregadores ee
        WHERE ee.entrega_id = v_atual.id AND ee.usuario_id = v_user.id
      );
    IF NOT v_pode THEN
      RAISE EXCEPTION 'Sem permissão para editar esta entrega.';
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

GRANT EXECUTE ON FUNCTION public.listar_entregas(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_entrega(text, uuid, text, date, uuid[], json, text, uuid, boolean, text, text, text, text, text, text, text) TO anon, authenticated;
