-- Renomeia o status "Em rota" para "Entrega iniciada".
-- Rode no SQL Editor do Supabase.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'status_entrega'
      AND e.enumlabel = 'em_rota'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'status_entrega'
      AND e.enumlabel = 'entrega_iniciada'
  ) THEN
    ALTER TYPE public.status_entrega RENAME VALUE 'em_rota' TO 'entrega_iniciada';
  END IF;
END $$;
