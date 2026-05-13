import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { addDays, format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { Minus, Plus } from "lucide-react";

export const Route = createFileRoute("/client/order")({
  component: NewOrder,
});

interface Article { id: string; name: string; photo_url: string | null; }
interface Location { id: string; name: string; }

function NewOrder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [locations, setLocations] = useState<Location[]>([]);
  const [days, setDays] = useState<number[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

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
      if (locs && locs.length) setLocationId(locs[0].id);
    })();
  }, [user]);

  // Available dates: next 6 weeks matching authorized days
  const availableDates = useMemo(() => {
    const out: Date[] = [];
    const start = new Date();
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i);
      if (days.includes(d.getDay())) out.push(d);
    }
    return out;
  }, [days]);

  useEffect(() => {
    if (!date && availableDates.length) setDate(format(availableDates[0], "yyyy-MM-dd"));
  }, [availableDates, date]);

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
    const { data: order, error } = await supabase.from("orders")
      .insert({ client_id: user.id, location_id: locationId, delivery_date: date, status: "todo" })
      .select("id").single();
    if (error || !order) { setSubmitting(false); return toast.error(error?.message ?? "Erreur"); }
    const { error: e2 } = await supabase.from("order_lines").insert(lines.map(l => ({ ...l, order_id: order.id })));
    setSubmitting(false);
    if (e2) return toast.error(e2.message);
    toast.success("Commande transmise");
    navigate({ to: "/client/history" });
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
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nouvelle commande</h1>
          <p className="text-sm text-muted-foreground mt-1">Une commande distincte par lieu de livraison.</p>
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
                <span className="w-8 text-center text-sm font-mono tabular-nums">{qty[a.id] ?? 0}</span>
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
            {submitting ? "Envoi…" : "Valider la commande"}
          </Button>
        </div>
      </div>
    </div>
  );
}
