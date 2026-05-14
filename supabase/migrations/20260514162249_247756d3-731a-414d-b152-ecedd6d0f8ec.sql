ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'driver';

ALTER TABLE public.delivery_locations
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivered_at timestamp with time zone;