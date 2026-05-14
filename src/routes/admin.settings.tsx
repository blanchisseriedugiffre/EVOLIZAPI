import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { updateOwnAdminCredentials, upsertDriverAccount, getDriverInfo, DRIVER_USERNAME_DEFAULT } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettings,
});

function AdminSettings() {
  const { user } = useAuth();
  const updateCreds = useServerFn(updateOwnAdminCredentials);
  const currentEmail = user?.email ?? "";
  const currentId = currentEmail.replace(/@atelier\.local$/, "");

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
    try {
      await updateCreds({ data: { identifier: id } });
      toast.success("Identifiant mis à jour", { description: "Effectif immédiatement." });
      // Refresh local session so the new email shows up
      await supabase.auth.refreshSession();
    } catch (err) {
      toast.error("Mise à jour impossible", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSavingId(false);
    }
  }

  async function updatePassword(e: FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Mot de passe trop court", { description: "Au moins 6 caractères." });
      return;
    }
    if (password !== confirm) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    setSavingPwd(true);
    try {
      await updateCreds({ data: { password } });
      toast.success("Mot de passe mis à jour");
      setPassword("");
      setConfirm("");
    } catch (err) {
      toast.error("Mise à jour impossible", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSavingPwd(false);
    }
  }

  return (
    <div className="max-w-xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Paramètres administrateur</h1>
        <p className="mt-1 text-sm text-muted-foreground">Identifiant actuel : <span className="font-mono">{currentEmail}</span></p>
      </div>

      <form onSubmit={updateIdentifier} className="space-y-4 rounded-lg border border-border bg-card p-6">
        <div>
          <h2 className="text-base font-medium">Identifiant</h2>
          <p className="text-xs text-muted-foreground mt-1">Nom d'utilisateur ou email. Modification effective immédiatement.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="identifier">Nouvel identifiant</Label>
          <Input
            id="identifier"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <Button type="submit" disabled={savingId}>
          {savingId ? "Enregistrement…" : "Mettre à jour l'identifiant"}
        </Button>
      </form>

      <form onSubmit={updatePassword} className="space-y-4 rounded-lg border border-border bg-card p-6">
        <div>
          <h2 className="text-base font-medium">Mot de passe</h2>
          <p className="text-xs text-muted-foreground mt-1">Au moins 6 caractères.</p>
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

      <DriverAccountSection />
    </div>
  );
}

function DriverAccountSection() {
  const upsert = useServerFn(upsertDriverAccount);
  const fetchInfo = useServerFn(getDriverInfo);
  const [exists, setExists] = useState<boolean | null>(null);
  const [username, setUsername] = useState(DRIVER_USERNAME_DEFAULT);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchInfo({ data: undefined } as any).then((r: any) => {
      if (r?.exists) {
        setExists(true);
        setUsername(r.username || DRIVER_USERNAME_DEFAULT);
      } else {
        setExists(false);
      }
    }).catch(() => setExists(false));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!exists && password.length < 4) {
      toast.error("Mot de passe d'au moins 4 caractères pour créer le compte");
      return;
    }
    setSaving(true);
    try {
      await upsert({ data: { username, ...(password ? { password } : {}) } });
      toast.success(exists ? "Compte chauffeur mis à jour" : "Compte chauffeur créé");
      setPassword("");
      setExists(true);
    } catch (err) {
      toast.error("Erreur", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-card p-6">
      <div>
        <h2 className="text-base font-medium">Compte chauffeur</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {exists === null ? "Chargement…"
            : exists ? "Modifier l'identifiant ou le mot de passe du chauffeur."
            : "Aucun compte chauffeur. Créez-en un pour donner accès à la tournée du jour."}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="driver-username">Identifiant</Label>
        <Input id="driver-username" value={username} onChange={(e) => setUsername(e.target.value)} minLength={2} maxLength={60} pattern="[a-zA-Z0-9._\-]+" required autoComplete="off" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="driver-password">{exists ? "Nouveau mot de passe (optionnel)" : "Mot de passe"}</Label>
        <Input id="driver-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder={exists ? "Laisser vide pour ne pas changer" : "Min. 4 caractères"} />
      </div>
      <Button type="submit" disabled={saving || exists === null}>
        {saving ? "Enregistrement…" : exists ? "Mettre à jour" : "Créer le compte chauffeur"}
      </Button>
    </form>
  );
}
