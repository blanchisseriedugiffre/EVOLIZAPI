
-- has_role must be callable by authenticated users (used inside RLS policies)
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
