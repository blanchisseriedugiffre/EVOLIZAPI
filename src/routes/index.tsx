import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { loading, session, role } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Chargement…</div>;
  if (!session) return <Navigate to="/login" />;
  if (role === "admin") return <Navigate to="/admin/dashboard" />;
  return <Navigate to="/client/order" />;
}
