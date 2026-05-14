import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettings,
});

function AdminSettings() {
  const { user } = useAuth();
  const currentId = user?.email?.replace(/@atelier\.local$/, "") ?? "";

  const [identifier, setIdentifier] = useState(currentId);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingId, setSavingId] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  async function updateIdentifier(e: FormEvent) {
    e.preventDefault();
    const id = identifier.trim();
    if (!id) return;
    setSavingId(true);
    const newEmail = id.includes("@") ? id : `${id.toLowerCase()}@atelier.local`;
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setSavingId(false);
    if (error) {
      toast.error("Mise à jour impossible", { description: error.message });
    } else {
      toast.success("Identifiant mis à jour");
    }
  }

  async function updatePassword(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Mot de passe trop court", { description: "Au moins 8 caractères." });
      return;
    }
    if (password !== confirm) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    setSavingPwd(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPwd(false);
    if (error) {
      toast.error("Mise à jour impossible", { description: error.message });
    } else {
      toast.success("Mot de passe mis à jour");
      setPassword("");
      setConfirm("");
    }
  }

  return (
    <div className="max-w-xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Paramètres administrateur</h1>
        <p className="mt-1 text-sm text-muted-foreground">Modifiez votre identifiant et votre mot de passe.</p>
      </div>

      <form onSubmit={updateIdentifier} className="space-y-4 rounded-lg border border-border bg-card p-6">
        <div>
          <h2 className="text-base font-medium">Identifiant</h2>
          <p className="text-xs text-muted-foreground mt-1">Utilisé pour vous connecter.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="identifier">Nom d'utilisateur ou email</Label>
          <Input
            id="identifier"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <Button type="submit" disabled={savingId || identifier.trim() === currentId}>
          {savingId ? "Enregistrement…" : "Mettre à jour l'identifiant"}
        </Button>
      </form>

      <form onSubmit={updatePassword} className="space-y-4 rounded-lg border border-border bg-card p-6">
        <div>
          <h2 className="text-base font-medium">Mot de passe</h2>
          <p className="text-xs text-muted-foreground mt-1">Au moins 8 caractères.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Nouveau mot de passe</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirmer le mot de passe</Label>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <Button type="submit" disabled={savingPwd}>
          {savingPwd ? "Enregistrement…" : "Mettre à jour le mot de passe"}
        </Button>
      </form>
    </div>
  );
}
