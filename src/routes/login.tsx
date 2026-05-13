import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { signIn, session, loading, role } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) {
    return <Navigate to={role === "admin" ? "/admin/dashboard" : "/client/order"} />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      toast.error("Connexion impossible", { description: error });
    } else {
      navigate({ to: "/" });
    }
  }

  function fill(e: string) {
    setEmail(e);
    setPassword("Demo!2025");
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-zinc-100/60 border-r border-border">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Atelier</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Gestion des commandes</h1>
        </div>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p className="text-foreground font-medium">Comptes de démonstration</p>
          <button onClick={() => fill("admin@demo.fr")} className="block w-full text-left rounded-lg border border-border bg-card p-3 hover:bg-accent transition-colors">
            <div className="font-medium text-foreground">admin@demo.fr</div>
            <div className="text-xs">Administrateur — tableau de commandes, catalogue, clients</div>
          </button>
          <button onClick={() => fill("bistrot@demo.fr")} className="block w-full text-left rounded-lg border border-border bg-card p-3 hover:bg-accent transition-colors">
            <div className="font-medium text-foreground">bistrot@demo.fr</div>
            <div className="text-xs">Client — Le Petit Bistrot (livraison le jeudi)</div>
          </button>
          <button onClick={() => fill("mairie@demo.fr")} className="block w-full text-left rounded-lg border border-border bg-card p-3 hover:bg-accent transition-colors">
            <div className="font-medium text-foreground">mairie@demo.fr</div>
            <div className="text-xs">Client — Mairie (mardi & vendredi)</div>
          </button>
          <p className="text-xs">Mot de passe pour tous : <span className="font-mono">Demo!2025</span></p>
        </div>
        <div className="text-xs text-muted-foreground">© Atelier · Démo</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Connexion</h2>
            <p className="mt-1 text-sm text-muted-foreground">Accédez à votre espace.</p>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Connexion…" : "Se connecter"}
          </Button>
        </form>
      </div>
    </div>
  );
}
