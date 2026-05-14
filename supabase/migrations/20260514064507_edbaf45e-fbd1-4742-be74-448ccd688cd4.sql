ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS note_seen_by_admin boolean NOT NULL DEFAULT true;