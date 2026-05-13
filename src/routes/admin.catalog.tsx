import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/admin/catalog")({
  component: Catalog,
});

interface Article { id: string; name: string; photo_url: string | null; }

function Catalog() {
  const [items, setItems] = useState<Article[]>([]);
  const [editing, setEditing] = useState<Article | null>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    const { data } = await supabase.from("articles").select("*").order("name");
    setItems(data ?? []);
  }
  useEffect(() => { load(); }, []);

  function startNew() { setEditing({ id: "", name: "", photo_url: null }); setOpen(true); }
  function startEdit(a: Article) { setEditing(a); setOpen(true); }

  async function remove(a: Article) {
    if (!confirm(`Supprimer "${a.name}" ?`)) return;
    const { error } = await supabase.from("articles").delete().eq("id", a.id);
    if (error) toast.error(error.message); else { toast.success("Supprimé"); load(); }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Catalogue</h1>
          <p className="text-sm text-muted-foreground mt-1">{items.length} article(s).</p>
        </div>
        <Button onClick={startNew}><Plus className="size-4" />Nouvel article</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(a => (
          <div key={a.id} className="rounded-xl ring-1 ring-black/5 shadow-sm bg-card overflow-hidden flex">
            <div className="size-24 shrink-0 bg-muted">
              {a.photo_url
                ? <img src={a.photo_url} alt={a.name} className="size-full object-cover" />
                : <div className="size-full grid place-items-center text-[10px] uppercase tracking-widest text-muted-foreground">Aucune photo</div>
              }
            </div>
            <div className="flex-1 p-3 flex flex-col justify-between">
              <div className="font-medium text-sm">{a.name}</div>
              <div className="flex gap-1 mt-2">
                <Button size="sm" variant="ghost" onClick={() => startEdit(a)}><Pencil className="size-3.5" /></Button>
                <Button size="sm" variant="ghost" onClick={() => remove(a)}><Trash2 className="size-3.5" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Modifier l'article" : "Nouvel article"}</DialogTitle></DialogHeader>
          {editing && <ArticleForm article={editing} onSaved={() => { setOpen(false); load(); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ArticleForm({ article, onSaved }: { article: Article; onSaved: () => void }) {
  const [name, setName] = useState(article.name);
  const [photoUrl, setPhotoUrl] = useState(article.photo_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function uploadFile(f: File) {
    setUploading(true);
    const ext = f.name.split(".").pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("article-photos").upload(path, f, { upsert: false });
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data } = supabase.storage.from("article-photos").getPublicUrl(path);
    setPhotoUrl(data.publicUrl);
    setUploading(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = { name: name.trim(), photo_url: photoUrl || null };
    const op = article.id
      ? supabase.from("articles").update(payload).eq("id", article.id)
      : supabase.from("articles").insert(payload);
    const { error } = await op;
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Enregistré"); onSaved(); }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Nom</Label>
        <Input value={name} onChange={e => setName(e.target.value)} required maxLength={120} />
      </div>
      <div className="space-y-1.5">
        <Label>Photo</Label>
        <Input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} disabled={uploading} />
        {photoUrl && <img src={photoUrl} alt="" className="size-32 object-cover rounded-md mt-2 ring-1 ring-border" />}
      </div>
      <DialogFooter>
        <Button type="submit" disabled={saving || uploading}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
      </DialogFooter>
    </form>
  );
}
