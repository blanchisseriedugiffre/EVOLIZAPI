CREATE POLICY "orders select driver today"
ON public.orders FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'driver'::app_role) AND delivery_date = CURRENT_DATE);

CREATE POLICY "orders update driver today"
ON public.orders FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'driver'::app_role) AND delivery_date = CURRENT_DATE)
WITH CHECK (has_role(auth.uid(), 'driver'::app_role) AND delivery_date = CURRENT_DATE);

CREATE POLICY "lines select driver today"
ON public.order_lines FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'driver'::app_role)
  AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_lines.order_id AND o.delivery_date = CURRENT_DATE)
);

CREATE POLICY "locations select driver"
ON public.delivery_locations FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'driver'::app_role));

CREATE POLICY "profiles select driver"
ON public.profiles FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'driver'::app_role));

CREATE POLICY "articles select driver"
ON public.articles FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'driver'::app_role));