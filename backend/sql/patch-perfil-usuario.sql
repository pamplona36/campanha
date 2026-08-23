-- O usuário logado pode atualizar o próprio nome e a senha.
-- Rode no SQL Editor do Supabase.

CREATE OR REPLACE FUNCTION public.atualizar_meu_perfil(p_token text, p_nome text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user public.usuarios;
BEGIN
  v_user := public._exige_login(p_token);
  IF p_nome IS NULL OR length(trim(p_nome)) < 2 THEN
    RAISE EXCEPTION 'Informe o nome.';
  END IF;

  UPDATE public.usuarios
  SET nome = trim(p_nome)
  WHERE id = v_user.id
  RETURNING * INTO v_user;

  RETURN json_build_object(
    'ok', true,
    'usuario', json_build_object(
      'id', v_user.id,
      'nome', v_user.nome,
      'login', v_user.login,
      'tipo', v_user.tipo
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.alterar_minha_senha(
  p_token       text,
  p_senha_atual text,
  p_senha_nova  text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user public.usuarios;
BEGIN
  v_user := public._exige_login(p_token);

  IF p_senha_atual IS NULL OR v_user.senha_hash <> extensions.crypt(p_senha_atual, v_user.senha_hash) THEN
    RAISE EXCEPTION 'Senha atual incorreta.';
  END IF;
  IF p_senha_nova IS NULL OR length(p_senha_nova) < 6 THEN
    RAISE EXCEPTION 'A nova senha deve ter no mínimo 6 caracteres.';
  END IF;
  IF p_senha_atual = p_senha_nova THEN
    RAISE EXCEPTION 'A nova senha deve ser diferente da atual.';
  END IF;

  UPDATE public.usuarios
  SET senha_hash = extensions.crypt(p_senha_nova, extensions.gen_salt('bf'))
  WHERE id = v_user.id;

  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.atualizar_meu_perfil(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alterar_minha_senha(text, text, text) TO anon, authenticated;
