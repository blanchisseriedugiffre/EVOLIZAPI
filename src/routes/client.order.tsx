import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { Minus, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { ClientNoteButton } from "@/components/NoteDialog";

const searchSchema = z.object({ id: z.string().uuid().optional() });

export const Route = createFileRoute("/client/order")({
  component: NewOrder,
  validateSearch: (s) => searchSchema.parse(s),
});

interface Article { id: string; name: string; photo_url: string | null; }
interface Location { id: string; name: string; }

function NewOrder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id: editId } = useSearch({ from: "/client/order" });
  const [locations, setLocations] = useState<Location[]>([]);
  const [days, setDays] = useState<number[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState<boolean>(!!editId);
  const [draftNote, setDraftNote] = useState<string>("");
  const [existingNote, setExistingNote] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: locs }, { data: ds }, { data: cArts }] = await Promise.all([
        supabase.from("delivery_locations").select("id, name").eq("client_id", user.id).order("name"),
        supabase.from("client_delivery_days").select("day_of_week").eq("client_id", user.id),
        supabase.from("client_articles").select("article_id, articles(id, name, photo_url)").eq("client_id", user.id),
      ]);
      setLocations(locs ?? []);
      setDays((ds ?? []).map(d => d.day_of_week));
      setArticles((cArts ?? []).map((c: any) => c.articles).filter(Boolean));
      if (!editId && locs && locs.length) setLocationId(locs[0].id);
    })();
  }, [user, editId]);

  // Load existing order to edit
  useEffect(() => {
    if (!editId || !user) return;
    (async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, status, location_id, delivery_date, client_id, note, order_lines(article_id, quantity)")
        .eq("id", editId)
        .maybeSingle();
      if (error || !data) { toast.error("Commande introuvable"); navigate({ to: "/client/history" }); return; }
      if (data.client_id !== user.id) { toast.error("Accès refusé"); navigate({ to: "/client/history" }); return; }
      if (data.status !== "todo") { toast.error("Cette commande n'est plus modifiable"); navigate({ to: "/client/history" }); return; }
      setLocationId(data.location_id);
      setDate(data.delivery_date);
      setExistingNote((data as any).note ?? null);
      const q: Record<string, number> = {};
      for (const l of (data.order_lines ?? []) as any[]) q[l.article_id] = l.quantity;
      setQty(q);
      setLoadingEdit(false);
    })();
  }, [editId, user, navigate]);

  const availableDates = useMemo(() => {
    const out: Date[] = [];
    const start = new Date();
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i);
      if (days.includes(d.getDay())) out.push(d);
    }
    // Ensure the currently-selected date (from edit) is selectable even if past today
    if (date && !out.some(d => format(d, "yyyy-MM-dd") === date)) {
      out.unshift(new Date(date));
    }
    return out;
  }, [days, date]);

  useEffect(() => {
    if (!editId && !date && availableDates.length) setDate(format(availableDates[0], "yyyy-MM-dd"));
  }, [availableDates, date, editId]);

  function bump(id: string, delta: number) {
    setQty(q => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + delta) }));
  }

  async function submit() {
    if (!user) return;
    if (!locationId) return toast.error("Choisissez un lieu");
    if (!date) return toast.error("Choisissez une date");
    const lines = Object.entries(qty).filter(([, q]) => q > 0).map(([article_id, quantity]) => ({ article_id, quantity }));
    if (!lines.length) return toast.error("Ajoutez au moins un article");
    setSubmitting(true);

    if (editId) {
      const { error: eUp } = await supabase.from("orders")
        .update({ location_id: locationId, delivery_date: date })
        .eq("id", editId);
      if (eUp) { setSubmitting(false); return toast.error(eUp.message); }
      const { error: eDel } = await supabase.from("order_lines").delete().eq("order_id", editId);
      if (eDel) { setSubmitting(false); return toast.error(eDel.message); }
      const { error: eIns } = await supabase.from("order_lines").insert(lines.map(l => ({ ...l, order_id: editId })));
      setSubmitting(false);
      if (eIns) return toast.error(eIns.message);
      toast.success("Commande mise à jour");
      navigate({ to: "/client/history" });
      return;
    }

    const { data: order, error } = await supabase.from("orders")
      .insert({
        client_id: user.id,
        location_id: locationId,
        delivery_date: date,
        status: "todo",
        note: draftNote.trim() || null,
        note_seen_by_admin: draftNote.trim() ? false : true,
      })
      .select("id").single();
    if (error || !order) { setSubmitting(false); return toast.error(error?.message ?? "Erreur"); }
    const { error: e2 } = await supabase.from("order_lines").insert(lines.map(l => ({ ...l, order_id: order.id })));
    setSubmitting(false);
    if (e2) return toast.error(e2.message);
    toast.success("Commande transmise");
    navigate({ to: "/client/history" });
  }

  async function remove() {
    if (!editId) return;
    if (!confirm("Supprimer cette commande ?")) return;
    const { error } = await supabase.from("orders").delete().eq("id", editId);
    if (error) return toast.error(error.message);
    toast.success("Commande supprimée");
    navigate({ to: "/client/history" });
  }

  if (loadingEdit) {
    return <div className="text-sm text-muted-foreground p-8">Chargement…</div>;
  }

  if (!locations.length || !days.length || !articles.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Votre compte n'est pas encore configuré pour passer commande. Contactez l'administrateur.
      </div>
    );
  }

  const total = Object.values(qty).reduce((s, n) => s + n, 0);

  return (
    <div className="grid lg:grid-cols-12 gap-8">
      <div className="lg:col-span-8 space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{editId ? "Modifier la commande" : "Nouvelle commande"}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {editId ? "Vous pouvez modifier tant que la commande est À faire." : "Une commande distincte par lieu de livraison."}
            </p>
          </div>
          {editId && (
            <Link to="/client/order" className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground">
              + Nouvelle commande
            </Link>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4 p-5 rounded-xl ring-1 ring-black/5 bg-card">
          <div className="space-y-1.5">
            <Label>Lieu de livraison</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date de livraison</Label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {availableDates.map(d => {
                const v = format(d, "yyyy-MM-dd");
                const sel = v === date;
                return (
                  <button key={v} type="button" onClick={() => setDate(v)}
                    className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium ${sel ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>
                    <div className="uppercase">{format(d, "EEE", { locale: fr })}</div>
                    <div className="text-sm font-bold">{format(d, "d MMM", { locale: fr })}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          {articles.map(a => (
            <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl ring-1 ring-black/5 bg-card">
              <div className="size-16 shrink-0 rounded-md bg-muted overflow-hidden">
                {a.photo_url
                  ? <img src={a.photo_url} alt={a.name} className="size-full object-cover" />
                  : <div className="size-full grid place-items-center text-[9px] uppercase tracking-widest text-muted-foreground">photo</div>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{a.name}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="icon" variant="outline" className="size-8" onClick={() => bump(a.id, -1)}><Minus className="size-3.5" /></Button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={qty[a.id] ?? 0}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    setQty(q => ({ ...q, [a.id]: Number.isFinite(n) && n >= 0 ? n : 0 }));
                  }}
                  className="w-14 h-8 text-center text-sm font-mono tabular-nums rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <Button size="icon" variant="outline" className="size-8" onClick={() => bump(a.id, 1)}><Plus className="size-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="lg:col-span-4">
        <div className="sticky top-20 rounded-xl ring-1 ring-black/5 bg-card p-6 space-y-4">
          <h3 className="font-semibold">Récapitulatif</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Lieu</span><span className="text-foreground">{locations.find(l => l.id === locationId)?.name}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Date</span><span className="text-foreground">{date && format(new Date(date), "EEE d MMM", { locale: fr })}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Articles</span><span className="text-foreground tabular-nums">{total}</span></div>
          </div>
          <Button className="w-full" disabled={submitting || total === 0} onClick={submit}>
            {submitting ? "Envoi…" : editId ? "Enregistrer" : "Valider la commande"}
          </Button>
          {editId && (
            <Button variant="outline" className="w-full" onClick={remove}>
              <Trash2 className="size-4 mr-1.5" /> Supprimer
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
