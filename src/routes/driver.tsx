import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/driver")({
  component: DriverLayout,
});

function DriverLayout() {
  const { loading, session, role } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Chargement…</div>;
  if (!session) return <Navigate to="/login" />;
  if (session && !role) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Chargement…</div>;
  if (role === "admin") return <Navigate to="/admin/dashboard" />;
  if (role === "client") return <Navigate to="/client/order" />;
  return (
    <AppShell title="Chauffeur" nav={[{ label: "Tournée du jour", to: "/driver/today" }]}>
      <Outlet />
    </AppShell>
  );
}
