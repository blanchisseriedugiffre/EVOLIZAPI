import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { createClientAccount, deleteClientAccount, updateClientCredentials, USERNAME_EMAIL_DOMAIN } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Settings2, X } from "lucide-react";
import { DAYS_FR_LONG } from "@/lib/orders";

export const Route = createFileRoute("/admin/clients")({
  component: ClientsAdmin,
});

interface ClientRow {
  id: string; name: string; email: string;
  logo_url: string | null;
  locations: { id: string; name: string }[];
  days: number[];
  article_ids: string[];
}

function ClientsAdmin() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [articles, setArticles] = useState<{ id: string; name: string }[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRow | null>(null);

  const createFn = useServerFn(createClientAccount);
  const deleteFn = useServerFn(deleteClientAccount);

  async function load() {
    const { data: roleRows } = await supabase.from("user_roles").select("user_id").eq("role", "client");
    const ids = (roleRows ?? []).map(r => r.user_id);
    if (!ids.length) { setClients([]); return; }
    const [{ data: profs }, { data: locs }, { data: days }, { data: cArts }, { data: arts }] = await Promise.all([
      supabase.from("profiles").select("id, name, email, logo_url").in("id", ids),
      supabase.from("delivery_locations").select("id, client_id, name").in("client_id", ids),
      supabase.from("client_delivery_days").select("client_id, day_of_week").in("client_id", ids),
      supabase.from("client_articles").select("client_id, article_id").in("client_id", ids),
      supabase.from("articles").select("id, name").order("name"),
    ]);
    setArticles(arts ?? []);
    setClients((profs ?? []).map(p => ({
      id: p.id, name: p.name, email: p.email, logo_url: p.logo_url,
      locations: (locs ?? []).filter(l => l.client_id === p.id).map(l => ({ id: l.id, name: l.name })),
      days: (days ?? []).filter(d => d.client_id === p.id).map(d => d.day_of_week).sort(),
      article_ids: (cArts ?? []).filter(c => c.client_id === p.id).map(c => c.article_id),
    })));
  }
  useEffect(() => { load(); }, []);

  function displayUsername(email: string) {
    const suffix = `@${USERNAME_EMAIL_DOMAIN}`;
    return email.endsWith(suffix) ? email.slice(0, -suffix.length) : email;
  }

  async function removeClient(c: ClientRow) {
    if (!confirm(`Supprimer le compte ${displayUsername(c.email)} ?`)) return;
    try { await deleteFn({ data: { userId: c.id } }); toast.success("Supprimé"); load(); }
    catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground mt-1">{clients.length} client(s).</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="size-4" />Nouveau client</Button>
      </div>

      <div className="rounded-xl ring-1 ring-black/5 shadow-sm bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Identifiant</th>
              <th className="px-4 py-3">Lieux</th>
              <th className="px-4 py-3">Jours</th>
              <th className="px-4 py-3">Articles</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {clients.map(c => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-medium">{c.name || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{displayUsername(c.email)}</td>
                <td className="px-4 py-3">{c.locations.length}</td>
                <td className="px-4 py-3">{c.days.map(d => DAYS_FR_LONG[d].slice(0, 3)).join(", ") || "—"}</td>
                <td className="px-4 py-3">{c.article_ids.length}</td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(c)}><Settings2 className="size-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => removeClient(c)}><Trash2 className="size-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouveau client</DialogTitle></DialogHeader>
          <CreateClientForm onCreated={() => { setCreateOpen(false); load(); }} createFn={createFn} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Configuration — {editing?.name || editing?.email}</DialogTitle></DialogHeader>
          {editing && <ClientConfig client={editing} articles={articles} onSaved={() => { setEditing(null); load(); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateClientForm({ onCreated, createFn }: { onCreated: () => void; createFn: ReturnType<typeof useServerFn<typeof createClientAccount>> }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await createFn({ data: { name, username, password } }); toast.success("Client créé"); onCreated(); }
    catch (e: any) { toast.error(e?.message ?? "Erreur"); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5"><Label>Nom</Label><Input value={name} onChange={e => setName(e.target.value)} required /></div>
      <div className="space-y-1.5">
        <Label>Nom d'utilisateur</Label>
        <Input value={username} onChange={e => setUsername(e.target.value)} required minLength={2} maxLength={60} pattern="[a-zA-Z0-9._\-]+" autoComplete="off" placeholder="ex. Bistrot" />
        <p className="text-[11px] text-muted-foreground">Lettres, chiffres, . _ - uniquement.</p>
      </div>
      <div className="space-y-1.5"><Label>Mot de passe (min. 4)</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={4} /></div>
      <DialogFooter><Button type="submit" disabled={busy}>{busy ? "Création…" : "Créer"}</Button></DialogFooter>
    </form>
  );
}

function ClientConfig({ client, articles, onSaved }: { client: ClientRow; articles: { id: string; name: string }[]; onSaved: () => void }) {
  const suffix = `@${USERNAME_EMAIL_DOMAIN}`;
  const currentUsername = client.email.endsWith(suffix) ? client.email.slice(0, -suffix.length) : client.email;
  const [name, setName] = useState(client.name);
  const [username, setUsername] = useState(currentUsername);
  const [password, setPassword] = useState("");
  const updateCredsFn = useServerFn(updateClientCredentials);
  const [logoUrl, setLogoUrl] = useState<string | null>(client.logo_url);
  const [uploading, setUploading] = useState(false);
  const [locations, setLocations] = useState(client.locations);
  const [newLoc, setNewLoc] = useState("");
  const [days, setDays] = useState<number[]>(client.days);
  const [articleIds, setArticleIds] = useState<string[]>(client.article_ids);
  const [saving, setSaving] = useState(false);

  function toggleDay(d: number) { setDays(s => s.includes(d) ? s.filter(x => x !== d) : [...s, d].sort()); }
  function toggleArticle(id: string) { setArticleIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]); }
  function addLoc() {
    const n = newLoc.trim(); if (!n) return;
    if (locations.length >= 10) { toast.error("Maximum 10 lieux"); return; }
    setLocations([...locations, { id: `tmp-${Date.now()}`, name: n }]); setNewLoc("");
  }
  function removeLoc(id: string) { setLocations(locations.filter(l => l.id !== id)); }

  async function uploadLogo(file: File) {
    if (file.size > 4 * 1024 * 1024) { toast.error("Image trop lourde (max 4 Mo)"); return; }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${client.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("client-logos").upload(path, file, { upsert: true, contentType: file.type });
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data } = supabase.storage.from("client-logos").getPublicUrl(path);
    setLogoUrl(data.publicUrl);
    setUploading(false);
  }

  async function save() {
    setSaving(true);
    try {
      const usernameChanged = username && username.toLowerCase() !== currentUsername.toLowerCase();
      if (usernameChanged || password) {
        await updateCredsFn({ data: {
          userId: client.id,
          ...(usernameChanged ? { username } : {}),
          ...(password ? { password } : {}),
        } });
      }
    } catch (e: any) {
      setSaving(false);
      toast.error(e?.message ?? "Erreur identifiants");
      return;
    }

    await supabase.from("profiles").update({ name, logo_url: logoUrl }).eq("id", client.id);

    // Locations: replace all (delete those missing, insert new)
    const existing = client.locations.map(l => l.id);
    const kept = locations.filter(l => !l.id.startsWith("tmp-"));
    const keptIds = new Set(kept.map(l => l.id));
    const toDelete = existing.filter(id => !keptIds.has(id));
    if (toDelete.length) await supabase.from("delivery_locations").delete().in("id", toDelete);
    const toInsert = locations.filter(l => l.id.startsWith("tmp-")).map(l => ({ client_id: client.id, name: l.name }));
    if (toInsert.length) await supabase.from("delivery_locations").insert(toInsert);

    await supabase.from("client_delivery_days").delete().eq("client_id", client.id);
    if (days.length) await supabase.from("client_delivery_days").insert(days.map(d => ({ client_id: client.id, day_of_week: d })));

    await supabase.from("client_articles").delete().eq("client_id", client.id);
    if (articleIds.length) await supabase.from("client_articles").insert(articleIds.map(id => ({ client_id: client.id, article_id: id })));

    setSaving(false);
    toast.success("Enregistré");
    onSaved();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5"><Label>Nom affiché</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <div className="space-y-1.5">
          <Label>Nom d'utilisateur</Label>
          <Input value={username} onChange={e => setUsername(e.target.value)} minLength={2} maxLength={60} pattern="[a-zA-Z0-9._\-]+" autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label>Nouveau mot de passe</Label>
          <Input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={4} placeholder="Laisser vide pour ne pas changer" autoComplete="new-password" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Logo du client</Label>
        <div className="flex items-center gap-4">
          <div className="size-16 rounded-md ring-1 ring-border bg-muted overflow-hidden grid place-items-center">
            {logoUrl
              ? <img src={logoUrl} alt="Logo" className="size-full object-cover" />
              : <span className="text-[9px] uppercase tracking-widest text-muted-foreground">logo</span>}
          </div>
          <div className="flex items-center gap-2">
            <Input type="file" accept="image/*" disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.currentTarget.value = ""; }}
              className="max-w-xs" />
            {logoUrl && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setLogoUrl(null)}>
                <X className="size-4" />
              </Button>
            )}
          </div>
        </div>
        {uploading && <p className="text-xs text-muted-foreground">Téléversement…</p>}
      </div>

      <div>
        <Label className="mb-2 block">Lieux de livraison ({locations.length}/10)</Label>
        <div className="space-y-2">
          {locations.map(l => (
            <div key={l.id} className="flex items-center gap-2 bg-muted/50 rounded-md px-2 py-1 text-sm">
              <Input
                value={l.name}
                onChange={e => setLocations(locations.map(x => x.id === l.id ? { ...x, name: e.target.value } : x))}
                className="flex-1 h-8"
              />
              <button type="button" onClick={() => removeLoc(l.id)} className="text-muted-foreground hover:text-destructive"><X className="size-4" /></button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input placeholder="Nom du lieu" value={newLoc} onChange={e => setNewLoc(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addLoc())} />
            <Button type="button" variant="secondary" onClick={addLoc}>Ajouter</Button>
          </div>
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Jours de livraison autorisés</Label>
        <div className="flex flex-wrap gap-2">
          {DAYS_FR_LONG.map((d, i) => (
            <button key={i} type="button" onClick={() => toggleDay(i)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border ${days.includes(i) ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-accent"}`}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Articles autorisés</Label>
        <div className="grid grid-cols-2 gap-2">
          {articles.map(a => (
            <label key={a.id} className="flex items-center gap-2 text-sm rounded-md border border-border bg-card px-3 py-2 cursor-pointer">
              <Checkbox checked={articleIds.includes(a.id)} onCheckedChange={() => toggleArticle(a.id)} />
              <span>{a.name}</span>
            </label>
          ))}
        </div>
      </div>

      <DialogFooter><Button onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</Button></DialogFooter>
    </div>
  );
}
