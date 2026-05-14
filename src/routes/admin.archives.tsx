import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { STATUS_LABEL, STATUS_BADGE_CLASS, STATUS_ROW_CLASS, type OrderStatus } from "@/lib/orders";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/archives")({
  component: Archives,
});

interface Row {
  id: string;
  order_number: number;
  client_name: string;
  location_name: string;
  delivery_date: string;
  created_at: string;
  status: OrderStatus;
  delivered_at: string | null;
  note: string | null;
  lines: { article_id: string; article_name: string; quantity: number }[];
}

function Archives() {
  const [rows, setRows] = useState<Row[]>([]);
  const [articles, setArticles] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [{ data: o }, { data: arts }] = await Promise.all([
      supabase
        .from("orders")
        .select("id, order_number, delivery_date, created_at, status, delivered_at, note, profiles(name), delivery_locations(name), order_lines(article_id, quantity, articles(name))")
        .eq("archived", true)
        .order("delivery_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("articles").select("id, name").order("name"),
    ]);
    setArticles(arts ?? []);
    setRows(
      (o ?? []).map((r: any) => ({
        id: r.id,
        order_number: r.order_number,
        client_name: r.profiles?.name ?? "—",
        location_name: r.delivery_locations?.name ?? "—",
        delivery_date: r.delivery_date,
        created_at: r.created_at,
        status: r.status,
        delivered_at: r.delivered_at ?? null,
        note: r.note ?? null,
        lines: (r.order_lines ?? []).map((l: any) => ({
          article_id: l.article_id,
          article_name: l.articles?.name ?? "?",
          quantity: l.quantity,
        })),
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("orders-archives")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function unarchive(id: string) {
    const { error } = await supabase.from("orders").update({ archived: false }).eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Commande reprise");
  }

  const visible = useMemo(() => rows, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Archives</h1>
        <p className="text-sm text-muted-foreground mt-1">Commandes archivées — cliquez sur Reprendre pour les remettre dans le tableau.</p>
      </div>

      <div className="overflow-hidden rounded-xl ring-1 ring-black/5 shadow-sm bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Date livr.</th>
                <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Client / Lieu</th>
                <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">N°</th>
                {articles.map(a => (
                  <th key={a.id} className="py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center whitespace-nowrap" title={a.name}>
                    {a.name.split(" ")[0]}
                  </th>
                ))}
                <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && <tr><td colSpan={4 + articles.length} className="py-12 text-center text-muted-foreground">Chargement…</td></tr>}
              {!loading && visible.length === 0 && (
                <tr><td colSpan={4 + articles.length} className="py-12 text-center text-muted-foreground">Aucune commande archivée.</td></tr>
              )}
              {visible.map(r => {
                const qtyByArt = new Map(r.lines.map(l => [l.article_id, l.quantity]));
                return (
                  <tr key={r.id} className={`${STATUS_ROW_CLASS[r.status]} hover:brightness-[0.98] transition`}>
                    <td className="py-3 px-4 align-top">
                      <div className="font-medium">{format(new Date(r.delivery_date), "EEE d MMM", { locale: fr })}</div>
                      <div className="text-xs text-muted-foreground">{format(new Date(r.created_at), "HH:mm")}</div>
                    </td>
                    <td className="py-3 px-4 align-top">
                      <div className="font-medium">{r.client_name}</div>
                      <div className="text-xs text-muted-foreground">{r.location_name}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-muted-foreground align-top whitespace-nowrap">
                      #{r.order_number}
                    </td>
                    {articles.map(a => (
                      <td key={a.id} className="py-3 px-3 text-center align-top tabular-nums">
                        {qtyByArt.get(a.id) ?? <span className="text-muted-foreground/40">·</span>}
                      </td>
                    ))}
                    <td className="py-3 px-4 text-right align-top">
                      <div className="inline-flex flex-col items-end gap-1">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider ring-1 ${STATUS_BADGE_CLASS[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                        <button
                          onClick={() => unarchive(r.id)}
                          className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider ring-1 bg-primary text-primary-foreground hover:brightness-95"
                          title="Remettre dans le tableau des commandes"
                        >
                          Reprendre
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
