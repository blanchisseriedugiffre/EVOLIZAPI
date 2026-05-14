import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { Minus, Plus } from "lucide-react";

export const Route = createFileRoute("/admin/new-order")({
  validateSearch: (s: Record<string, unknown>) => ({ orderId: typeof s.orderId === "string" ? s.orderId : undefined }),
  component: AdminNewOrder,
});

interface Client { id: string; name: string; email: string; }
interface Article { id: string; name: string; photo_url: string | null; }
interface Location { id: string; name: string; }

function AdminNewOrder() {
  const navigate = useNavigate();
  const { orderId } = Route.useSearch();
  const isEditing = Boolean(orderId);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [days, setDays] = useState<number[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [restrictDay, setRestrictDay] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editLoaded, setEditLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "client");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (!ids.length) { setClients([]); return; }
      const { data: profs } = await supabase.from("profiles").select("id, name, email").in("id", ids);
      const list: Client[] = (profs ?? [])
        .slice()
        .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
      setClients(list);
    })();
  }, []);

  useEffect(() => {
    if (!isEditing || !orderId || editLoaded) return;
    (async () => {
      const { data: o } = await supabase
        .from("orders")
        .select("client_id, location_id, delivery_date, order_lines(article_id, quantity)")
        .eq("id", orderId)
        .maybeSingle();
      if (!o) { toast.error("Commande introuvable"); return; }
      setClientId(o.client_id);
      // pending values applied once locations/articles load
      pendingRef.current = {
        locationId: o.location_id,
        date: o.delivery_date,
        qty: Object.fromEntries((o.order_lines ?? []).map((l: any) => [l.article_id, l.quantity])),
      };
      setEditLoaded(true);
    })();
  }, [isEditing, orderId, editLoaded]);

  const pendingRef = (useMemo(() => ({ current: null as null | { locationId: string; date: string; qty: Record<string, number> } }), []));

  useEffect(() => {
    if (!clientId) {
      setLocations([]); setDays([]); setArticles([]);
      setLocationId(""); setDate(""); setQty({});
      return;
    }
    (async () => {
      const [{ data: locs }, { data: ds }, { data: cArts }] = await Promise.all([
        supabase.from("delivery_locations").select("id, name").eq("client_id", clientId).order("name"),
        supabase.from("client_delivery_days").select("day_of_week").eq("client_id", clientId),
        supabase.from("client_articles").select("article_id, articles(id, name, photo_url)").eq("client_id", clientId),
      ]);
      setLocations(locs ?? []);
      setDays((ds ?? []).map(d => d.day_of_week));
      setArticles((cArts ?? []).map((c: any) => c.articles).filter(Boolean));
      const pending = pendingRef.current;
      if (pending) {
        setLocationId(pending.locationId);
        setDate(pending.date);
        setQty(pending.qty);
        setRestrictDay(false);
        pendingRef.current = null;
      } else {
        setLocationId(locs && locs.length ? locs[0].id : "");
        setDate("");
        setQty({});
      }
    })();
  }, [clientId]);

  const availableDates = useMemo(() => {
    const out: Date[] = [];
    const start = new Date();
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i);
      if (!restrictDay || days.includes(d.getDay())) out.push(d);
    }
    // ensure currently-selected (edit) date is present
    if (date && !out.find(d => format(d, "yyyy-MM-dd") === date)) {
      out.unshift(new Date(date));
    }
    return out;
  }, [days, restrictDay, date]);

  useEffect(() => {
    if (!date && availableDates.length) setDate(format(availableDates[0], "yyyy-MM-dd"));
  }, [availableDates, date]);

  function bump(id: string, delta: number) {
    setQty(q => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + delta) }));
  }

  async function submit() {
    if (!clientId) return toast.error("Choisissez un client");
    if (!locationId) return toast.error("Choisissez un lieu");
    if (!date) return toast.error("Choisissez une date");
    const lines = Object.entries(qty).filter(([, q]) => q > 0).map(([article_id, quantity]) => ({ article_id, quantity }));
    if (!lines.length) return toast.error("Ajoutez au moins un article");
    setSubmitting(true);
    if (isEditing && orderId) {
      const { error: eUp } = await supabase.from("orders")
        .update({ client_id: clientId, location_id: locationId, delivery_date: date })
        .eq("id", orderId);
      if (eUp) { setSubmitting(false); return toast.error(eUp.message); }
      const { error: eDel } = await supabase.from("order_lines").delete().eq("order_id", orderId);
      if (eDel) { setSubmitting(false); return toast.error(eDel.message); }
      const { error: eIns } = await supabase.from("order_lines").insert(lines.map(l => ({ ...l, order_id: orderId })));
      setSubmitting(false);
      if (eIns) return toast.error(eIns.message);
      toast.success("Commande modifiée");
      navigate({ to: "/admin/dashboard" });
      return;
    }
    const { data: order, error } = await supabase.from("orders")
      .insert({ client_id: clientId, location_id: locationId, delivery_date: date, status: "todo" })
      .select("id").single();
    if (error || !order) { setSubmitting(false); return toast.error(error?.message ?? "Erreur"); }
    const { error: e2 } = await supabase.from("order_lines").insert(lines.map(l => ({ ...l, order_id: order.id })));
    setSubmitting(false);
    if (e2) return toast.error(e2.message);
    toast.success("Commande créée pour le client");
    navigate({ to: "/admin/dashboard" });
  }

  const total = Object.values(qty).reduce((s, n) => s + n, 0);
  const selectedClient = clients.find(c => c.id === clientId);

  return (
    <div className="grid lg:grid-cols-12 gap-8">
      <div className="lg:col-span-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Saisir une commande</h1>
          <p className="text-sm text-muted-foreground mt-1">Créez une commande à la place d'un client.</p>
        </div>

        <div className="p-5 rounded-xl ring-1 ring-black/5 bg-card space-y-4">
          <div className="space-y-1.5">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Sélectionner un client…" /></SelectTrigger>
              <SelectContent>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name || c.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {clientId && (
            <div className="grid sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <Label>Lieu de livraison</Label>
                <Select value={locationId} onValueChange={setLocationId} disabled={!locations.length}>
                  <SelectTrigger><SelectValue placeholder={locations.length ? "Choisir…" : "Aucun lieu configuré"} /></SelectTrigger>
                  <SelectContent>
                    {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Date de livraison</Label>
                  <button type="button" onClick={() => setRestrictDay(v => !v)} className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
                    {restrictDay ? "Tous les jours" : "Jours autorisés"}
                  </button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {availableDates.slice(0, 21).map(d => {
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
                  {!availableDates.length && <div className="text-xs text-muted-foreground py-2">Aucun jour de livraison configuré</div>}
                </div>
              </div>
            </div>
          )}
        </div>

        {clientId && articles.length > 0 && (
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
        )}
        {clientId && !articles.length && (
          <div className="text-sm text-muted-foreground p-4 rounded-lg bg-muted/40">Ce client n'a aucun article autorisé.</div>
        )}
      </div>

      <div className="lg:col-span-4">
        <div className="sticky top-20 rounded-xl ring-1 ring-black/5 bg-card p-6 space-y-4">
          <h3 className="font-semibold">Récapitulatif</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Client</span><span className="text-foreground">{selectedClient?.name || selectedClient?.email || "—"}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Lieu</span><span className="text-foreground">{locations.find(l => l.id === locationId)?.name || "—"}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Date</span><span className="text-foreground">{date ? format(new Date(date), "EEE d MMM", { locale: fr }) : "—"}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Articles</span><span className="text-foreground tabular-nums">{total}</span></div>
          </div>
          <Button className="w-full" disabled={submitting || total === 0 || !clientId || !locationId || !date} onClick={submit}>
            {submitting ? "Envoi…" : "Créer la commande"}
          </Button>
        </div>
      </div>
    </div>
  );
}
