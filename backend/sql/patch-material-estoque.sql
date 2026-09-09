-- Estoque atual do material. Entregas baixam o saldo; exclusão/edição devolve.
-- Rode no SQL Editor do Supabase em bancos já existentes.

ALTER TABLE public.materiais ADD COLUMN IF NOT EXISTS estoque integer NOT NULL DEFAULT 0;
ALTER TABLE public.materiais DROP CONSTRAINT IF EXISTS materiais_estoque_chk;
ALTER TABLE public.materiais ADD CONSTRAINT materiais_estoque_chk CHECK (estoque >= 0);

CREATE OR REPLACE FUNCTION public.listar_materiais(p_token text)
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
      SELECT id, nome, tipo, estoque, created_at FROM public.materiais
    ) t
  ), '[]'::json);
END;
$$;

DROP FUNCTION IF EXISTS public.salvar_material(text, uuid, text, text);

CREATE OR REPLACE FUNCTION public.salvar_material(
  p_token   text,
  p_id      uuid,
  p_nome    text,
  p_tipo    text,
  p_estoque integer DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id      uuid;
  v_estoque integer;
BEGIN
  PERFORM public._exige_gestao(p_token);

  IF NOT EXISTS (SELECT 1 FROM public.tipos_material WHERE nome = trim(p_tipo)) THEN
    RAISE EXCEPTION 'Tipo de material inválido.';
  END IF;

  v_estoque := COALESCE(p_estoque, 0);
  IF v_estoque < 0 THEN
    RAISE EXCEPTION 'Informe um estoque atual válido.';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.materiais (nome, tipo, estoque)
    VALUES (trim(p_nome), trim(p_tipo), v_estoque)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.materiais
    SET nome = trim(p_nome),
        tipo = trim(p_tipo),
        estoque = v_estoque
    WHERE id = p_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Material não encontrado.';
    END IF;
  END IF;

  RETURN json_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public._trg_entrega_item_estoque()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_nome text;
  v_disp integer;
  v_delta integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.materiais
    SET estoque = estoque + OLD.quantidade
    WHERE id = OLD.material_id;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.material_id IS DISTINCT FROM NEW.material_id THEN
    UPDATE public.materiais
    SET estoque = estoque + OLD.quantidade
    WHERE id = OLD.material_id;
    v_delta := NEW.quantidade;
  ELSIF TG_OP = 'UPDATE' THEN
    v_delta := NEW.quantidade - OLD.quantidade;
  ELSE
    v_delta := NEW.quantidade;
  END IF;

  SELECT nome, estoque INTO v_nome, v_disp
  FROM public.materiais
  WHERE id = NEW.material_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material não encontrado.';
  END IF;
  IF v_delta > 0 AND v_disp < v_delta THEN
    RAISE EXCEPTION 'Estoque insuficiente de %. Disponível: %. Solicitado: %.',
      v_nome, v_disp, NEW.quantidade;
  END IF;

  UPDATE public.materiais
  SET estoque = estoque - v_delta
  WHERE id = NEW.material_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_entrega_itens_estoque ON public.entrega_itens;
CREATE TRIGGER trg_entrega_itens_estoque
  AFTER INSERT OR UPDATE OR DELETE ON public.entrega_itens
  FOR EACH ROW
  EXECUTE FUNCTION public._trg_entrega_item_estoque();

GRANT EXECUTE ON FUNCTION public.listar_materiais(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_material(text, uuid, text, text, integer) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._trg_entrega_item_estoque() FROM anon, authenticated, public;

NOTIFY pgrst, 'reload schema';
