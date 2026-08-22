-- Excluir entrega: somente administrador.
-- Rode no SQL Editor do Supabase.

CREATE OR REPLACE FUNCTION public.excluir_entrega(p_token text, p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public._exige_admin(p_token);

  DELETE FROM public.entregas
  WHERE id = p_id
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Entrega não encontrada.';
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.excluir_entrega(text, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
