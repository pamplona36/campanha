-- Quem recebeu deixa de ser obrigatório.
-- Rode no SQL Editor do Supabase.

ALTER TABLE public.entregas DROP CONSTRAINT IF EXISTS entregas_recebeu_chk;
ALTER TABLE public.entregas ALTER COLUMN quem_recebeu DROP NOT NULL;
