import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { loading, session, role } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Chargement…</div>;
  if (!session) return <Navigate to="/login" />;
  if (role !== "admin") return <Navigate to="/client/order" />;
  return (
    <AppShell
      title="Admin"
      nav={[
        { label: "Commandes", to: "/admin/dashboard" },
        { label: "Saisir", to: "/admin/new-order" },
        { label: "Catalogue", to: "/admin/catalog" },
        { label: "Clients", to: "/admin/clients" },
      ]}
    >
      <Outlet />
    </AppShell>
  );
}
