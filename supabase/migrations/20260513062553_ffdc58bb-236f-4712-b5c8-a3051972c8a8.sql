
-- Roles enum and table (separate from profiles to avoid privilege escalation)
CREATE TYPE public.app_role AS ENUM ('admin', 'client');
CREATE TYPE public.order_status AS ENUM ('todo', 'in_progress', 'done');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);

CREATE TABLE public.articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.client_articles (
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, article_id)
);

CREATE TABLE public.delivery_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 0 = Sunday ... 6 = Saturday
CREATE TABLE public.client_delivery_days (
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  PRIMARY KEY (client_id, day_of_week)
);

CREATE SEQUENCE public.order_number_seq START 1000;

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number BIGINT NOT NULL DEFAULT nextval('public.order_number_seq'),
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.delivery_locations(id) ON DELETE RESTRICT,
  delivery_date DATE NOT NULL,
  status public.order_status NOT NULL DEFAULT 'todo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);

-- Security definer for role checks (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- Auto-create profile + client role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', ''), NEW.email);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_delivery_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_lines ENABLE ROW LEVEL SECURITY;

-- profiles: client sees self, admin sees all; admin manages all
CREATE POLICY "profiles select self or admin" ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles update self or admin" ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles insert admin" ON public.profiles FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles delete admin" ON public.profiles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- user_roles: user can read own; only admin manages
CREATE POLICY "user_roles select self or admin" ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles admin manage" ON public.user_roles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- articles: any authenticated can read; admin manages
CREATE POLICY "articles select all auth" ON public.articles FOR SELECT TO authenticated USING (true);
CREATE POLICY "articles admin manage" ON public.articles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- client_articles: client sees own, admin all; admin manages
CREATE POLICY "client_articles select self or admin" ON public.client_articles FOR SELECT TO authenticated
USING (client_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "client_articles admin manage" ON public.client_articles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- delivery_locations
CREATE POLICY "locations select self or admin" ON public.delivery_locations FOR SELECT TO authenticated
USING (client_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "locations admin manage" ON public.delivery_locations FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- client_delivery_days
CREATE POLICY "days select self or admin" ON public.client_delivery_days FOR SELECT TO authenticated
USING (client_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "days admin manage" ON public.client_delivery_days FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- orders: client sees & creates own (status todo), admin all
CREATE POLICY "orders select self or admin" ON public.orders FOR SELECT TO authenticated
USING (client_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "orders insert self or admin" ON public.orders FOR INSERT TO authenticated
WITH CHECK (client_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "orders update todo self or admin" ON public.orders FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (client_id = auth.uid() AND status = 'todo')
);
CREATE POLICY "orders delete todo self or admin" ON public.orders FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (client_id = auth.uid() AND status = 'todo')
);

-- order_lines: follow the parent order
CREATE POLICY "lines select via order" ON public.order_lines FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_lines.order_id
    AND (o.client_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
));
CREATE POLICY "lines insert via order" ON public.order_lines FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_lines.order_id
    AND (public.has_role(auth.uid(), 'admin')
         OR (o.client_id = auth.uid() AND o.status = 'todo'))
));
CREATE POLICY "lines update via order" ON public.order_lines FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_lines.order_id
    AND (public.has_role(auth.uid(), 'admin')
         OR (o.client_id = auth.uid() AND o.status = 'todo'))
));
CREATE POLICY "lines delete via order" ON public.order_lines FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_lines.order_id
    AND (public.has_role(auth.uid(), 'admin')
         OR (o.client_id = auth.uid() AND o.status = 'todo'))
));

-- Storage bucket for article photos
INSERT INTO storage.buckets (id, name, public) VALUES ('article-photos', 'article-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "article photos public read" ON storage.objects FOR SELECT
USING (bucket_id = 'article-photos');
CREATE POLICY "article photos admin write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'article-photos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "article photos admin update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'article-photos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "article photos admin delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'article-photos' AND public.has_role(auth.uid(), 'admin'));

-- Realtime for orders
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_lines REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_lines;
