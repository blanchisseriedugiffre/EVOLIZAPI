import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Blanchisserie du Giffre — Gestion de commandes de linge" },
      { name: "description", content: "Gérez vos commandes de linge en ligne avec la Blanchisserie du Giffre." },
      { property: "og:title", content: "Blanchisserie du Giffre" },
      { property: "og:description", content: "Gérez vos commandes de linge en ligne." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { signIn, session, loading, role } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) {
    const target = role === "admin" ? "/admin/dashboard" : role === "driver" ? "/driver" : "/client/order";
    return <Navigate to={target} />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const id = email.trim();
    const loginEmail = id.includes("@") ? id : `${id.toLowerCase()}@atelier.local`;
    const { error } = await signIn(loginEmail, password);
    setSubmitting(false);
    if (error) {
      toast.error("Connexion impossible", { description: error });
    } else {
      navigate({ to: "/" });
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Partie gauche : photo en haut, titre en bas */}
      <div className="flex flex-col items-center justify-center gap-8 p-8 lg:p-12 bg-background border-b lg:border-b-0 lg:border-r border-border">
        <img
          src="/camion-livraison.jpg"
          alt="Camion de livraison Blanchisserie du Giffre"
          className="w-full max-w-xl rounded-2xl shadow-lg object-cover"
        />
        <img
          src="/titre-bleu.jpg"
          alt="Blanchisserie du Giffre"
          className="w-full max-w-xl object-contain"
        />
      </div>

      {/* Partie droite : formulaire de connexion */}
      <div className="flex items-center justify-center p-6">
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Connexion</h2>
            <p className="mt-1 text-sm text-muted-foreground">Accédez à votre espace.</p>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Identifiant</Label>
              <Input id="email" type="text" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" placeholder="nom d'utilisateur ou email" />
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
