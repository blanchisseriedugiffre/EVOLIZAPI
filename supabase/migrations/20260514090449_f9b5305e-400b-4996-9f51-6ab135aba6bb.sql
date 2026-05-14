ALTER TABLE public.orders ADD COLUMN archived boolean NOT NULL DEFAULT false;
CREATE INDEX idx_orders_archived ON public.orders(archived);