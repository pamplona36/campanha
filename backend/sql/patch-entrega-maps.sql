-- Maps: usa o endereço da entrega sem misturar com o do colaborador.
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
        to_jsonb(c)->>'telefone' AS colaborador_telefone,
        c.endereco AS colaborador_endereco,
        c.numero AS colaborador_numero,
        c.complemento AS colaborador_complemento,
        c.bairro AS colaborador_bairro,
        c.cidade AS colaborador_cidade,
        c.estado AS colaborador_estado,
        COALESCE(e.usa_endereco_colaborador, true) AS usa_endereco_colaborador,
        CASE WHEN COALESCE(e.usa_endereco_colaborador, true)
          THEN COALESCE(NULLIF(trim(e.endereco), ''), c.endereco)
          ELSE e.endereco
        END AS endereco,
        CASE WHEN COALESCE(e.usa_endereco_colaborador, true)
          THEN COALESCE(NULLIF(trim(e.numero), ''), c.numero)
          ELSE e.numero
        END AS numero,
        CASE WHEN COALESCE(e.usa_endereco_colaborador, true)
          THEN COALESCE(NULLIF(trim(e.complemento), ''), c.complemento)
          ELSE e.complemento
        END AS complemento,
        CASE WHEN COALESCE(e.usa_endereco_colaborador, true)
          THEN COALESCE(NULLIF(trim(e.bairro), ''), c.bairro)
          ELSE e.bairro
        END AS bairro,
        CASE WHEN COALESCE(e.usa_endereco_colaborador, true)
          THEN COALESCE(NULLIF(trim(e.cidade), ''), c.cidade)
          ELSE e.cidade
        END AS cidade,
        CASE WHEN COALESCE(e.usa_endereco_colaborador, true)
          THEN COALESCE(NULLIF(trim(e.estado), ''), c.estado)
          ELSE e.estado
        END AS estado,
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

GRANT EXECUTE ON FUNCTION public.listar_entregas(text, integer) TO anon, authenticated;
