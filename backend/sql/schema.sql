-- =============================================================================
-- CAMPANHA — Controle de Entrega de Materiais
-- Cole este script no SQL Editor do Supabase e clique em RUN (uma única vez).
-- Banco já existente: rode os patches em backend/sql/ conforme a necessidade.
-- UF/cidades (IBGE): backend/sql/patch-localidades.sql
-- Telefone do colaborador: backend/sql/patch-colaborador-telefone.sql
-- Banco/agência/conta opcionais: backend/sql/patch-colaborador-banco-opcional.sql
-- Perfil e senha do usuário logado: backend/sql/patch-perfil-usuario.sql
-- Observações da entrega: backend/sql/patch-entrega-observacoes.sql
-- Todos veem as entregas; alterar só quem está em Quem entregou: backend/sql/patch-entregas-visao-geral.sql
-- Maps com endereço correto: backend/sql/patch-entrega-maps.sql
-- Forma de pagamento e comprovante opcional: backend/sql/patch-pagamento-forma.sql
-- Perfis admin / geral / motorista: backend/sql/patch-tipos-usuario.sql
-- Tipo do colaborador (líder / agente / comércio): backend/sql/patch-colaborador-tipo.sql
-- =============================================================================
-- Login inicial após executar:
--   usuário: admin
--   senha:   admin123
-- Troque essa senha imediatamente após o primeiro acesso.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
SET search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- Tipos enumerados
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.tipo_perfil AS ENUM ('admin', 'usuario');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.status_entrega AS ENUM ('novo', 'entrega_iniciada', 'entregue', 'reagendado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usuarios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL,
  login       text NOT NULL,
  senha_hash  text NOT NULL,
  tipo        text NOT NULL DEFAULT 'motorista',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usuarios_login_unique UNIQUE (login),
  CONSTRAINT usuarios_login_chk CHECK (length(trim(login)) >= 3),
  CONSTRAINT usuarios_nome_chk CHECK (length(trim(nome)) >= 2),
  CONSTRAINT usuarios_tipo_chk CHECK (tipo IN ('admin', 'geral', 'motorista'))
);

CREATE TABLE IF NOT EXISTS public.tipos_material (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tipos_material_nome_unique UNIQUE (nome),
  CONSTRAINT tipos_material_nome_chk CHECK (length(trim(nome)) >= 2)
);

CREATE TABLE IF NOT EXISTS public.colaboradores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          text NOT NULL,
  cpf           text,
  telefone      text,
  endereco      text,
  numero        text,
  complemento   text,
  bairro        text,
  cidade        text,
  estado        text,
  folha         boolean NOT NULL DEFAULT false,
  valor_mensal  numeric(12,2),
  banco         text,
  agencia       text,
  conta         text,
  tipo          text,
  data_inicio   date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT colaboradores_nome_chk CHECK (length(trim(nome)) >= 2),
  CONSTRAINT colaboradores_cpf_chk CHECK (cpf IS NULL OR cpf ~ '^\d{11}$'),
  CONSTRAINT colaboradores_telefone_chk CHECK (telefone IS NULL OR telefone ~ '^\d{10,11}$'),
  CONSTRAINT colaboradores_folha_valor_chk CHECK (
    (folha = false AND valor_mensal IS NULL)
    OR (folha = true AND valor_mensal IS NOT NULL AND valor_mensal >= 0)
  ),
  CONSTRAINT colaboradores_estado_chk CHECK (
    estado IS NULL OR char_length(estado) = 2
  ),
  CONSTRAINT colaboradores_tipo_chk CHECK (
    tipo IS NULL OR tipo IN ('lider', 'agente', 'comercio')
  )
);

ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS telefone text;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS banco text;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS agencia text;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS conta text;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS tipo text;

ALTER TABLE public.colaboradores DROP CONSTRAINT IF EXISTS colaboradores_tipo_chk;
ALTER TABLE public.colaboradores ADD CONSTRAINT colaboradores_tipo_chk
  CHECK (tipo IS NULL OR tipo IN ('lider', 'agente', 'comercio'));

ALTER TABLE public.colaboradores DROP CONSTRAINT IF EXISTS colaboradores_cpf_chk;
ALTER TABLE public.colaboradores ADD CONSTRAINT colaboradores_cpf_chk
  CHECK (cpf IS NULL OR cpf ~ '^\d{11}$');

ALTER TABLE public.colaboradores DROP CONSTRAINT IF EXISTS colaboradores_telefone_chk;
ALTER TABLE public.colaboradores ADD CONSTRAINT colaboradores_telefone_chk
  CHECK (telefone IS NULL OR telefone ~ '^\d{10,11}$');

CREATE UNIQUE INDEX IF NOT EXISTS colaboradores_cpf_uidx
  ON public.colaboradores (cpf)
  WHERE cpf IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.estados (
  uf    text PRIMARY KEY,
  nome  text NOT NULL,
  CONSTRAINT estados_uf_chk CHECK (char_length(uf) = 2)
);

CREATE TABLE IF NOT EXISTS public.cidades (
  id       serial PRIMARY KEY,
  uf       text NOT NULL REFERENCES public.estados(uf) ON UPDATE CASCADE ON DELETE RESTRICT,
  nome     text NOT NULL,
  ibge_id  integer
);

ALTER TABLE public.cidades ADD COLUMN IF NOT EXISTS ibge_id integer;
CREATE UNIQUE INDEX IF NOT EXISTS cidades_uf_nome_uidx ON public.cidades (uf, nome);
CREATE UNIQUE INDEX IF NOT EXISTS cidades_ibge_uidx ON public.cidades (ibge_id) WHERE ibge_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cidades_uf ON public.cidades (uf);

CREATE TABLE IF NOT EXISTS public.pagamentos_folha (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE RESTRICT,
  usuario_id      uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  data_pagamento  date NOT NULL DEFAULT CURRENT_DATE,
  valor           numeric(12,2) NOT NULL,
  comprovante     text,
  forma           text NOT NULL DEFAULT 'pix',
  ocr_texto       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pagamentos_folha_valor_chk CHECK (valor >= 0),
  CONSTRAINT pagamentos_folha_forma_chk CHECK (forma IN ('dinheiro', 'deposito', 'pix')),
  CONSTRAINT pagamentos_folha_comp_chk CHECK (
    comprovante IS NULL OR length(comprovante) BETWEEN 32 AND 1500000
  )
);

ALTER TABLE public.pagamentos_folha ADD COLUMN IF NOT EXISTS forma text;
ALTER TABLE public.pagamentos_folha ALTER COLUMN comprovante DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pagamentos_folha_colaborador
  ON public.pagamentos_folha (colaborador_id, data_pagamento DESC);

CREATE TABLE IF NOT EXISTS public.materiais (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL,
  tipo        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT materiais_nome_chk CHECK (length(trim(nome)) >= 2),
  CONSTRAINT materiais_tipo_fk FOREIGN KEY (tipo)
    REFERENCES public.tipos_material (nome)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.entregas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE RESTRICT,
  quem_recebeu    text,
  data_entrega    date NOT NULL DEFAULT CURRENT_DATE,
  status          public.status_entrega NOT NULL DEFAULT 'novo',
  usuario_id      uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  usa_endereco_colaborador boolean NOT NULL DEFAULT true,
  endereco        text,
  numero          text,
  complemento     text,
  bairro          text,
  cidade          text,
  estado          text,
  observacoes     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entregas_observacoes_chk CHECK (observacoes IS NULL OR char_length(observacoes) <= 2000)
);

ALTER TABLE public.entregas ADD COLUMN IF NOT EXISTS usa_endereco_colaborador boolean NOT NULL DEFAULT true;
ALTER TABLE public.entregas ADD COLUMN IF NOT EXISTS endereco text;
ALTER TABLE public.entregas ADD COLUMN IF NOT EXISTS numero text;
ALTER TABLE public.entregas ADD COLUMN IF NOT EXISTS complemento text;
ALTER TABLE public.entregas ADD COLUMN IF NOT EXISTS bairro text;
ALTER TABLE public.entregas ADD COLUMN IF NOT EXISTS cidade text;
ALTER TABLE public.entregas ADD COLUMN IF NOT EXISTS estado text;
ALTER TABLE public.entregas ADD COLUMN IF NOT EXISTS observacoes text;
ALTER TABLE public.entregas DROP CONSTRAINT IF EXISTS entregas_observacoes_chk;
ALTER TABLE public.entregas ADD CONSTRAINT entregas_observacoes_chk
  CHECK (observacoes IS NULL OR char_length(observacoes) <= 2000);

CREATE TABLE IF NOT EXISTS public.entrega_itens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id    uuid NOT NULL REFERENCES public.entregas(id) ON DELETE CASCADE,
  material_id   uuid NOT NULL REFERENCES public.materiais(id) ON DELETE RESTRICT,
  quantidade    integer NOT NULL,
  CONSTRAINT entrega_itens_qtd_chk CHECK (quantidade > 0)
);

CREATE TABLE IF NOT EXISTS public.entrega_entregadores (
  entrega_id  uuid NOT NULL REFERENCES public.entregas(id) ON DELETE CASCADE,
  usuario_id  uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  PRIMARY KEY (entrega_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS public.sessoes (
  token        text PRIMARY KEY,
  usuario_id   uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entregas_colaborador ON public.entregas (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_entregas_data        ON public.entregas (data_entrega);
CREATE INDEX IF NOT EXISTS idx_entregas_status      ON public.entregas (status);
CREATE INDEX IF NOT EXISTS idx_entregas_usuario     ON public.entregas (usuario_id);
CREATE INDEX IF NOT EXISTS idx_entrega_itens_entrega ON public.entrega_itens (entrega_id);
CREATE INDEX IF NOT EXISTS idx_entrega_itens_material ON public.entrega_itens (material_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_entrega_itens_material ON public.entrega_itens (entrega_id, material_id);
CREATE INDEX IF NOT EXISTS idx_entrega_entregadores_usuario ON public.entrega_entregadores (usuario_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario      ON public.sessoes (usuario_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_expira       ON public.sessoes (expires_at);
CREATE INDEX IF NOT EXISTS idx_usuarios_login_lower ON public.usuarios (lower(login));
CREATE INDEX IF NOT EXISTS idx_materiais_tipo       ON public.materiais (tipo);

-- -----------------------------------------------------------------------------
-- RLS (defesa em profundidade — o app acessa dados só via RPC SECURITY DEFINER)
-- -----------------------------------------------------------------------------
ALTER TABLE public.usuarios        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colaboradores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiais       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entregas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entrega_itens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entrega_entregadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipos_material  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessoes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos_folha ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cidades ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.usuarios        FROM anon, authenticated;
REVOKE ALL ON TABLE public.colaboradores   FROM anon, authenticated;
REVOKE ALL ON TABLE public.pagamentos_folha FROM anon, authenticated;
REVOKE ALL ON TABLE public.estados FROM anon, authenticated;
REVOKE ALL ON TABLE public.cidades FROM anon, authenticated;
REVOKE ALL ON TABLE public.materiais       FROM anon, authenticated;
REVOKE ALL ON TABLE public.entregas        FROM anon, authenticated;
REVOKE ALL ON TABLE public.entrega_itens   FROM anon, authenticated;
REVOKE ALL ON TABLE public.entrega_entregadores FROM anon, authenticated;
REVOKE ALL ON TABLE public.tipos_material  FROM anon, authenticated;
REVOKE ALL ON TABLE public.sessoes         FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- Funções auxiliares de sessão
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._sessao(p_token text)
RETURNS TABLE (id uuid, nome text, login text, tipo text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.id, u.nome, u.login, u.tipo::text
  FROM public.sessoes s
  JOIN public.usuarios u ON u.id = s.usuario_id
  WHERE s.token = p_token
    AND s.expires_at > now();
END;
$$;

CREATE OR REPLACE FUNCTION public._exige_login(p_token text)
RETURNS public.usuarios
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user public.usuarios;
BEGIN
  SELECT u.* INTO v_user
  FROM public.sessoes s
  JOIN public.usuarios u ON u.id = s.usuario_id
  WHERE s.token = p_token
    AND s.expires_at > now();

  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida ou expirada. Faça login novamente.';
  END IF;

  RETURN v_user;
END;
$$;

CREATE OR REPLACE FUNCTION public._exige_admin(p_token text)
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
  IF v_user.tipo::text <> 'admin' THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;
  RETURN v_user;
END;
$$;

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

-- -----------------------------------------------------------------------------
-- Autenticação
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.login(p_login text, p_senha text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user  public.usuarios;
  v_token text;
  v_exp   timestamptz;
BEGIN
  DELETE FROM public.sessoes WHERE expires_at < now();

  SELECT * INTO v_user
  FROM public.usuarios
  WHERE lower(login) = lower(trim(p_login));

  IF v_user.id IS NULL OR v_user.senha_hash <> extensions.crypt(p_senha, v_user.senha_hash) THEN
    RETURN json_build_object('ok', false, 'erro', 'Usuário ou senha inválidos.');
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_exp   := now() + interval '7 days';

  INSERT INTO public.sessoes (token, usuario_id, expires_at)
  VALUES (v_token, v_user.id, v_exp);

  RETURN json_build_object(
    'ok', true,
    'token', v_token,
    'expires_at', v_exp,
    'usuario', json_build_object(
      'id', v_user.id,
      'nome', v_user.nome,
      'login', v_user.login,
      'tipo', v_user.tipo
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.logout(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  DELETE FROM public.sessoes WHERE token = p_token;
  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.me(p_token text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user public.usuarios;
BEGIN
  SELECT u.* INTO v_user
  FROM public.sessoes s
  JOIN public.usuarios u ON u.id = s.usuario_id
  WHERE s.token = p_token
    AND s.expires_at > now();

  IF v_user.id IS NULL THEN
    RETURN json_build_object('ok', false);
  END IF;

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

-- -----------------------------------------------------------------------------
-- Usuários (admin)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Colaboradores
-- -----------------------------------------------------------------------------
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
        c.tipo,
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

CREATE OR REPLACE FUNCTION public.listar_estados(p_token text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public._exige_login(p_token);

  RETURN COALESCE((
    SELECT json_agg(json_build_object('uf', e.uf, 'nome', e.nome) ORDER BY e.nome)
    FROM public.estados e
  ), '[]'::json);
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_cidades(p_token text, p_estado text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uf text;
BEGIN
  PERFORM public._exige_login(p_token);
  v_uf := upper(trim(COALESCE(p_estado, '')));
  IF v_uf = '' THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE((
    SELECT json_agg(json_build_object('nome', c.nome) ORDER BY c.nome)
    FROM public.cidades c
    WHERE c.uf = v_uf
  ), '[]'::json);
END;
$$;

DROP FUNCTION IF EXISTS public.salvar_colaborador(text, uuid, text, text, text, text, text, text, text, boolean, numeric, date);
DROP FUNCTION IF EXISTS public.salvar_colaborador(text, uuid, text, text, text, text, text, text, text, boolean, numeric, date, text, text, text, text);
DROP FUNCTION IF EXISTS public.salvar_colaborador(text, uuid, text, text, text, text, text, text, text, boolean, numeric, date, text, text, text, text, text);

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
  p_telefone     text DEFAULT NULL,
  p_tipo         text DEFAULT NULL
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
  v_tipo    text;
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
  v_tipo := lower(trim(COALESCE(p_tipo, '')));
  IF v_tipo NOT IN ('lider', 'agente', 'comercio') THEN
    RAISE EXCEPTION 'Informe o tipo do colaborador.';
  END IF;

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
      folha, valor_mensal, banco, agencia, conta, tipo, data_inicio
    ) VALUES (
      trim(p_nome), v_cpf, v_tel, nullif(trim(p_endereco), ''), nullif(trim(p_numero), ''),
      nullif(trim(p_complemento), ''), nullif(trim(p_bairro), ''),
      nullif(trim(p_cidade), ''), v_uf,
      v_folha, v_valor, v_banco, v_agencia, v_conta, v_tipo, p_data_inicio
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
      tipo = v_tipo,
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

-- -----------------------------------------------------------------------------
-- Pagamentos da folha
-- -----------------------------------------------------------------------------
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
        p.forma,
        (p.comprovante IS NOT NULL AND length(trim(p.comprovante)) >= 32) AS tem_comprovante,
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
      p.forma,
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

DROP FUNCTION IF EXISTS public.salvar_pagamento_folha(text, uuid, date, numeric, text, text);

CREATE OR REPLACE FUNCTION public.salvar_pagamento_folha(
  p_token           text,
  p_colaborador_id  uuid,
  p_data_pagamento  date,
  p_valor           numeric,
  p_forma           text,
  p_comprovante     text DEFAULT NULL,
  p_ocr_texto       text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user  public.usuarios;
  v_id    uuid;
  v_comp  text;
  v_forma text;
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

  v_forma := lower(trim(COALESCE(p_forma, '')));
  IF v_forma NOT IN ('dinheiro', 'deposito', 'pix') THEN
    RAISE EXCEPTION 'Informe a forma de pagamento.';
  END IF;

  v_comp := nullif(trim(COALESCE(p_comprovante, '')), '');
  IF v_comp IS NOT NULL THEN
    IF v_comp !~ '^data:image/(jpeg|jpg|png|webp);base64,' THEN
      RAISE EXCEPTION 'A foto do comprovante é inválida.';
    END IF;
    IF length(v_comp) < 32 OR length(v_comp) > 1500000 THEN
      RAISE EXCEPTION 'A foto do comprovante é inválida ou grande demais.';
    END IF;
  END IF;

  INSERT INTO public.pagamentos_folha (
    colaborador_id, usuario_id, data_pagamento, valor, forma, comprovante, ocr_texto
  ) VALUES (
    p_colaborador_id,
    v_user.id,
    p_data_pagamento,
    round(p_valor, 2),
    v_forma,
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

CREATE OR REPLACE FUNCTION public.relatorio_folha_pagamento(
  p_token     text,
  p_data_ini  date DEFAULT NULL,
  p_data_fim  date DEFAULT NULL,
  p_situacao  text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ini    date;
  v_fim    date;
  v_sit    text;
  v_itens  json;
  v_totais json;
BEGIN
  PERFORM public._exige_admin(p_token);

  v_ini := COALESCE(p_data_ini, date_trunc('month', CURRENT_DATE)::date);
  v_fim := COALESCE(
    p_data_fim,
    (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date
  );
  IF v_ini > v_fim THEN
    RAISE EXCEPTION 'A data inicial não pode ser maior que a data final.';
  END IF;

  v_sit := lower(nullif(trim(COALESCE(p_situacao, '')), ''));
  IF v_sit = 'todos' THEN
    v_sit := NULL;
  END IF;
  IF v_sit IS NOT NULL AND v_sit NOT IN ('pago', 'aberto') THEN
    RAISE EXCEPTION 'Situação inválida.';
  END IF;

  WITH base AS (
    SELECT
      c.id AS colaborador_id,
      c.nome AS colaborador_nome,
      to_jsonb(c)->>'cpf' AS cpf,
      to_jsonb(c)->>'banco' AS banco,
      to_jsonb(c)->>'agencia' AS agencia,
      to_jsonb(c)->>'conta' AS conta,
      c.valor_mensal AS valor_mensal,
      c.data_inicio AS data_inicio,
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', p.id,
          'data_pagamento', p.data_pagamento,
          'valor', p.valor,
          'forma', p.forma,
          'tem_comprovante', (p.comprovante IS NOT NULL AND length(trim(p.comprovante)) >= 32),
          'usuario_nome', u.nome
        ) ORDER BY p.data_pagamento DESC, p.created_at DESC)
        FROM public.pagamentos_folha p
        JOIN public.usuarios u ON u.id = p.usuario_id
        WHERE p.colaborador_id = c.id
          AND p.data_pagamento BETWEEN v_ini AND v_fim
      ), '[]'::json) AS pagamentos,
      COALESCE((
        SELECT SUM(p.valor)
        FROM public.pagamentos_folha p
        WHERE p.colaborador_id = c.id
          AND p.data_pagamento BETWEEN v_ini AND v_fim
      ), 0) AS valor_pago,
      COALESCE((
        SELECT COUNT(*)::integer
        FROM public.pagamentos_folha p
        WHERE p.colaborador_id = c.id
          AND p.data_pagamento BETWEEN v_ini AND v_fim
      ), 0) AS qtd_pagamentos,
      (
        SELECT MAX(p.data_pagamento)
        FROM public.pagamentos_folha p
        WHERE p.colaborador_id = c.id
          AND p.data_pagamento BETWEEN v_ini AND v_fim
      ) AS ultima_data
    FROM public.colaboradores c
    WHERE c.folha = true
      AND (c.data_inicio IS NULL OR c.data_inicio <= v_fim)
  ),
  marcado AS (
    SELECT
      *,
      CASE WHEN qtd_pagamentos > 0 THEN 'pago' ELSE 'aberto' END AS situacao,
      CASE WHEN qtd_pagamentos > 0 THEN 0 ELSE COALESCE(valor_mensal, 0) END AS valor_aberto
    FROM base
  )
  SELECT
    COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY
        CASE t.situacao WHEN 'aberto' THEN 0 ELSE 1 END,
        t.colaborador_nome
      )
      FROM marcado t
      WHERE v_sit IS NULL OR t.situacao = v_sit
    ), '[]'::json),
    json_build_object(
      'periodo_ini', v_ini,
      'periodo_fim', v_fim,
      'colaboradores', COUNT(*)::integer,
      'pagos', COUNT(*) FILTER (WHERE situacao = 'pago')::integer,
      'abertos', COUNT(*) FILTER (WHERE situacao = 'aberto')::integer,
      'valor_folha', COALESCE(SUM(valor_mensal), 0),
      'valor_pago', COALESCE(SUM(valor_pago), 0),
      'valor_aberto', COALESCE(SUM(valor_aberto), 0)
    )
  INTO v_itens, v_totais
  FROM marcado;

  RETURN json_build_object(
    'ok', true,
    'itens', COALESCE(v_itens, '[]'::json),
    'totais', COALESCE(v_totais, json_build_object(
      'periodo_ini', v_ini,
      'periodo_fim', v_fim,
      'colaboradores', 0,
      'pagos', 0,
      'abertos', 0,
      'valor_folha', 0,
      'valor_pago', 0,
      'valor_aberto', 0
    ))
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Tipos de material
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_tipos(p_token text)
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
      SELECT id, nome, created_at FROM public.tipos_material
    ) t
  ), '[]'::json);
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

-- -----------------------------------------------------------------------------
-- Materiais
-- -----------------------------------------------------------------------------
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
      SELECT id, nome, tipo, created_at FROM public.materiais
    ) t
  ), '[]'::json);
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

-- -----------------------------------------------------------------------------
-- Entregas
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Permissões de execução para a chave anon (usada no front-end)
-- -----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.login(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.logout(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.me(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_meu_perfil(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alterar_minha_senha(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listar_usuarios(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listar_equipe(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_usuario(text, uuid, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_usuario(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listar_colaboradores(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listar_estados(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listar_cidades(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_colaborador(text, uuid, text, text, text, text, text, text, text, boolean, numeric, date, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_colaborador(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listar_pagamentos_folha(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obter_pagamento_folha(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_pagamento_folha(text, uuid, date, numeric, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_pagamento_folha(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.relatorio_folha_pagamento(text, date, date, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listar_tipos(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_tipo(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_tipo(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listar_materiais(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_material(text, uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_material(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listar_entregas(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_entrega(text, uuid, text, date, uuid[], json, text, uuid, boolean, text, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_entrega(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_status_entrega(text, uuid, text, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.relatorio_entregas(text, uuid, text, date, date, text) TO anon, authenticated;

-- Funções internas não devem ser chamadas pelo cliente
REVOKE EXECUTE ON FUNCTION public._sessao(text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public._exige_login(text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public._exige_admin(text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public._exige_gestao(text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public._eh_gestao(text) FROM anon, authenticated, public;

-- -----------------------------------------------------------------------------
-- Dados iniciais
-- -----------------------------------------------------------------------------
INSERT INTO public.tipos_material (nome) VALUES
  ('Santinho'),
  ('Bandeira'),
  ('Pirulito'),
  ('Praguinha'),
  ('Adesivo Perfurado'),
  ('Revista'),
  ('Wind Banner')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO public.usuarios (nome, login, senha_hash, tipo)
SELECT 'Administrador', 'admin', extensions.crypt('admin123', extensions.gen_salt('bf')), 'admin'
WHERE NOT EXISTS (
  SELECT 1 FROM public.usuarios WHERE lower(login) = 'admin'
);

NOTIFY pgrst, 'reload schema';
