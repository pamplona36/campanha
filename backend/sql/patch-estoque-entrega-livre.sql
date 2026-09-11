-- Permite gerar entrega mesmo com estoque zero ou insuficiente.
-- O saldo continua sendo abatido (pode ficar negativo).
-- Rode no SQL Editor do Supabase em bancos já existentes.

ALTER TABLE public.materiais DROP CONSTRAINT IF EXISTS materiais_estoque_chk;

CREATE OR REPLACE FUNCTION public._trg_entrega_item_estoque()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
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

  IF NOT EXISTS (SELECT 1 FROM public.materiais WHERE id = NEW.material_id) THEN
    RAISE EXCEPTION 'Material não encontrado.';
  END IF;

  UPDATE public.materiais
  SET estoque = estoque - v_delta
  WHERE id = NEW.material_id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._trg_entrega_item_estoque() FROM anon, authenticated, public;

NOTIFY pgrst, 'reload schema';
