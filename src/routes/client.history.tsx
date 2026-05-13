import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { STATUS_LABEL, STATUS_ROW_CLASS, STATUS_BADGE_CLASS, type OrderStatus } from "@/lib/orders";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Pencil } from "lucide-react";

export const Route = createFileRoute("/client/history")({
  component: History,
});

interface Row {
  id: string; order_number: number; delivery_date: string; created_at: string;
  status: OrderStatus; location_name: string;
  lines: { name: string; quantity: number }[];
}

function History() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("orders")
      .select("id, order_number, delivery_date, created_at, status, delivery_locations(name), order_lines(quantity, articles(name))")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false });
    setRows((data ?? []).map((r: any) => ({
      id: r.id, order_number: r.order_number, delivery_date: r.delivery_date, created_at: r.created_at,
      status: r.status, location_name: r.delivery_locations?.name ?? "—",
      lines: (r.order_lines ?? []).map((l: any) => ({ name: l.articles?.name ?? "?", quantity: l.quantity })),
    })));
  }
  useEffect(() => { load(); }, [user]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("orders-client").on("postgres_changes",
      { event: "*", schema: "public", table: "orders", filter: `client_id=eq.${user.id}` },
      () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Historique des commandes</h1>
        <p className="text-sm text-muted-foreground mt-1">{rows.length} commande(s).</p>
      </div>
      <div className="space-y-3">
        {rows.length === 0 && <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">Aucune commande pour l'instant.</div>}
        {rows.map(r => (
          <div key={r.id} className={`rounded-xl ring-1 ring-black/5 p-5 ${STATUS_ROW_CLASS[r.status]}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs text-muted-foreground font-mono">#{r.order_number} · {format(new Date(r.created_at), "d MMM yyyy HH:mm", { locale: fr })}</div>
                <div className="font-medium mt-1">Livraison {format(new Date(r.delivery_date), "EEEE d MMM", { locale: fr })}</div>
                <div className="text-sm text-muted-foreground">{r.location_name}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider ring-1 ${STATUS_BADGE_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                {r.status === "todo" && (
                  <Link to="/client/order" search={{ id: r.id }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider ring-1 ring-border bg-background hover:bg-accent">
                    <Pencil className="size-3" /> Reprendre
                  </Link>
                )}
              </div>
            </div>
            <div className="mt-3 text-sm">
              {r.lines.map((l, i) => <span key={i} className="inline-block mr-3"><span className="font-mono">{l.quantity}×</span> {l.name}</span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
