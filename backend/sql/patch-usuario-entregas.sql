-- Admin: vê TODAS as entregas (limite alto).
-- Usuário comum: vê só as entregas dele e pode confirmar/reagendar (com nova data).
-- Rode no SQL Editor do Supabase.

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
        (v_admin
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

GRANT EXECUTE ON FUNCTION public.atualizar_status_entrega(text, uuid, text, date) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
