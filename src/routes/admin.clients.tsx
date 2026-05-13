import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { createClientAccount, deleteClientAccount } from "@/lib/admin.functions";
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
      supabase.from("profiles").select("id, name, email").in("id", ids),
      supabase.from("delivery_locations").select("id, client_id, name").in("client_id", ids),
      supabase.from("client_delivery_days").select("client_id, day_of_week").in("client_id", ids),
      supabase.from("client_articles").select("client_id, article_id").in("client_id", ids),
      supabase.from("articles").select("id, name").order("name"),
    ]);
    setArticles(arts ?? []);
    setClients((profs ?? []).map(p => ({
      id: p.id, name: p.name, email: p.email,
      locations: (locs ?? []).filter(l => l.client_id === p.id).map(l => ({ id: l.id, name: l.name })),
      days: (days ?? []).filter(d => d.client_id === p.id).map(d => d.day_of_week).sort(),
      article_ids: (cArts ?? []).filter(c => c.client_id === p.id).map(c => c.article_id),
    })));
  }
  useEffect(() => { load(); }, []);

  async function removeClient(c: ClientRow) {
    if (!confirm(`Supprimer le compte ${c.email} ?`)) return;
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
              <th className="px-4 py-3">Email</th>
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
                <td className="px-4 py-3 text-muted-foreground">{c.email}</td>
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await createFn({ data: { name, email, password } }); toast.success("Client créé"); onCreated(); }
    catch (e: any) { toast.error(e?.message ?? "Erreur"); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5"><Label>Nom</Label><Input value={name} onChange={e => setName(e.target.value)} required /></div>
      <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
      <div className="space-y-1.5"><Label>Mot de passe (min. 8)</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} /></div>
      <DialogFooter><Button type="submit" disabled={busy}>{busy ? "Création…" : "Créer"}</Button></DialogFooter>
    </form>
  );
}

function ClientConfig({ client, articles, onSaved }: { client: ClientRow; articles: { id: string; name: string }[]; onSaved: () => void }) {
  const [name, setName] = useState(client.name);
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

  async function save() {
    setSaving(true);
    await supabase.from("profiles").update({ name }).eq("id", client.id);

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

      <div>
        <Label className="mb-2 block">Lieux de livraison ({locations.length}/10)</Label>
        <div className="space-y-2">
          {locations.map(l => (
            <div key={l.id} className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-1.5 text-sm">
              <span className="flex-1">{l.name}</span>
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
