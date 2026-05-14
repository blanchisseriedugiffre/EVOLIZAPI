import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { STATUS_LABEL, STATUS_NEXT, STATUS_ROW_CLASS, STATUS_BADGE_CLASS, type OrderStatus } from "@/lib/orders";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { AdminNoteCell } from "@/components/NoteDialog";

export const Route = createFileRoute("/admin/dashboard")({
  component: Dashboard,
});

interface Row {
  id: string;
  order_number: number;
  client_name: string;
  location_name: string;
  delivery_date: string;
  created_at: string;
  status: OrderStatus;
  note: string | null;
  note_seen_by_admin: boolean;
  lines: { article_id: string; article_name: string; quantity: number }[];
}

function Dashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [articles, setArticles] = useState<{ id: string; name: string }[]>([]);
  const [filter, setFilter] = useState<"all" | OrderStatus>("all");
  const [loading, setLoading] = useState(true);

  async function load() {
    const [{ data: o }, { data: arts }] = await Promise.all([
      supabase
        .from("orders")
        .select("id, order_number, delivery_date, created_at, status, note, note_seen_by_admin, profiles(name), delivery_locations(name), order_lines(article_id, quantity, articles(name))")
        .eq("archived", false)
        .order("delivery_date", { ascending: true })
        .order("created_at", { ascending: true }),
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
        note: r.note ?? null,
        note_seen_by_admin: r.note_seen_by_admin ?? true,
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
      .channel("orders-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_lines" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function setStatus(id: string, status: OrderStatus) {
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
  }

  async function archiveOrder(id: string) {
    const { error } = await supabase.from("orders").update({ archived: true }).eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Commande archivée");
  }

  const visible = useMemo(() => filter === "all" ? rows : rows.filter(r => r.status === filter), [rows, filter]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tableau des commandes</h1>
          <p className="text-sm text-muted-foreground mt-1">Suivi temps réel — cliquez sur un statut pour le faire avancer.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" /> En direct
          </span>
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="w-40 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous statuts</SelectItem>
              <SelectItem value="todo">À faire</SelectItem>
              <SelectItem value="in_progress">En cours</SelectItem>
              <SelectItem value="done">Terminée</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
                  <th key={a.id} className="py-3 px-2 w-14 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center leading-tight break-words" title={a.name}>
                    {a.name.split(" ").slice(0, 2).join(" ")}
                  </th>
                ))}
                <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && <tr><td colSpan={4 + articles.length} className="py-12 text-center text-muted-foreground">Chargement…</td></tr>}
              {!loading && visible.length === 0 && (
                <tr><td colSpan={4 + articles.length} className="py-12 text-center text-muted-foreground">Aucune commande.</td></tr>
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
                      {r.note && <span className="ml-2 inline-block"><AdminNoteCell orderId={r.id} note={r.note} seen={r.note_seen_by_admin} /></span>}
                    </td>
                    {articles.map(a => (
                      <td key={a.id} className="py-3 px-3 text-center align-top tabular-nums">
                        {qtyByArt.get(a.id) ?? <span className="text-muted-foreground/40">·</span>}
                      </td>
                    ))}
                    <td className="py-3 px-4 text-right align-top">
                      <div className="inline-flex flex-col items-end gap-1">
                        <button
                          onClick={() => setStatus(r.id, STATUS_NEXT[r.status])}
                          className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider ring-1 ${STATUS_BADGE_CLASS[r.status]} cursor-pointer hover:brightness-95`}
                          title="Cliquer pour faire avancer le statut"
                        >
                          {STATUS_LABEL[r.status]}
                        </button>
                        {r.status === "done" && (
                          <button
                            onClick={() => archiveOrder(r.id)}
                            className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider ring-1 bg-muted text-foreground hover:brightness-95"
                            title="Archiver la commande"
                          >
                            Archiver
                          </button>
                        )}
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
