import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/client")({
  component: ClientLayout,
});

function ClientLayout() {
  const { loading, session, role } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Chargement…</div>;
  if (!session) return <Navigate to="/login" />;
  if (role !== "client") return <Navigate to="/admin/dashboard" />;
  return (
    <AppShell
      title="Espace client"
      nav={[
        { label: "Nouvelle commande", to: "/client/order" },
        { label: "Historique", to: "/client/history" },
      ]}
    >
      <Outlet />
    </AppShell>
  );
}
