import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { STATUS_LABEL, STATUS_NEXT, STATUS_ROW_CLASS, STATUS_BADGE_CLASS, type OrderStatus } from "@/lib/orders";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { AdminNoteCell } from "@/components/NoteDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

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
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [editConfirmId, setEditConfirmId] = useState<string | null>(null);
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

  function printOrder(r: Row) {
    const w = window.open("", "_blank", "width=380,height=600");
    if (!w) { toast.error("Impossible d'ouvrir la fenêtre d'impression"); return; }
    const dateLivr = format(new Date(r.delivery_date), "EEEE d MMMM yyyy", { locale: fr });
    const dateCmd = format(new Date(r.created_at), "d MMM yyyy 'à' HH:mm", { locale: fr });
    const lines = r.lines
      .filter(l => l.quantity > 0)
      .map(l => `<tr><td style="padding:7px 6px;border-bottom:1px dashed #999;font-weight:bold">${l.article_name}</td><td style="padding:7px 6px;border-bottom:1px dashed #999;text-align:right;font-weight:bold">${l.quantity}</td></tr>`)
      .join("");
    const noteHtml = r.note ? `<div style="margin-top:8px;padding:6px;border:1px dashed #000"><b>Note:</b> ${r.note.replace(/</g, "&lt;")}</div>` : "";
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Commande #${r.order_number}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: -apple-system, system-ui, sans-serif; font-size: 12px; color: #000; margin: 0; padding: 4px; width: 72mm; }
  h1 { font-size: 16px; margin: 0 0 6px; text-align: center; }
  .row { margin: 2px 0; }
  .label { font-weight: 600; text-transform: uppercase; font-size: 10px; color: #444; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { text-align: left; padding: 4px 6px; border-bottom: 2px solid #000; font-size: 11px; }
  hr { border: none; border-top: 1px solid #000; margin: 6px 0; }
</style></head><body>
  <h1>Commande #${r.order_number}</h1>
  <hr/>
  <div class="row"><span class="label">Lieu:</span> <b style="font-size:21px">${r.location_name}</b></div>
  <div class="row"><span class="label">Client:</span> ${r.client_name}</div>
  <div class="row"><span class="label">Livraison:</span> <b>${dateLivr}</b></div>
  <div class="row"><span class="label">Commandé le:</span> ${dateCmd}</div>
  <div class="row"><span class="label">Statut:</span> ${STATUS_LABEL[r.status]}</div>
  ${noteHtml}
  <table>
    <thead><tr><th>Article</th><th style="text-align:right">Qté</th></tr></thead>
    <tbody>${lines || '<tr><td colspan="2" style="padding:6px;text-align:center;color:#666">Aucun article</td></tr>'}</tbody>
  </table>
  <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300);};</script>
</body></html>`);
    w.document.close();
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
                    </td>
                    <td className="py-3 px-4 align-top">
                      <div className="font-bold">{r.location_name}</div>
                      <div className="text-xs text-muted-foreground">{r.client_name}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-muted-foreground align-top whitespace-nowrap">
                      <div>#{r.order_number}{r.note && <span className="ml-2 inline-block"><AdminNoteCell orderId={r.id} note={r.note} seen={r.note_seen_by_admin} /></span>}</div>
                      <div className="text-[10px] mt-0.5">{format(new Date(r.created_at), "d MMM yy", { locale: fr })}</div>
                      <div className="text-[10px]">{format(new Date(r.created_at), "HH:mm")}</div>
                    </td>
                    {articles.map(a => (
                      <td key={a.id} className="py-3 px-3 text-center align-top tabular-nums">
                        {qtyByArt.get(a.id) ?? <span className="text-muted-foreground/40">·</span>}
                      </td>
                    ))}
                     <td className="py-3 px-4 text-right align-top">
                      <div className="inline-flex flex-col items-end gap-1">
                        <div className="inline-flex items-center gap-1.5">
                          {(r.status === "todo" || r.status === "in_progress") && (
                            <button
                              onClick={() => printOrder(r)}
                              className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ring-1 ring-border bg-background text-foreground hover:brightness-95"
                              title="Imprimer le ticket"
                              aria-label="Imprimer"
                            >
                              🖨
                            </button>
                          )}
                          {r.status === "todo" && (
                            <button
                              onClick={() => setEditConfirmId(r.id)}
                              className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ring-1 ring-border bg-background text-foreground hover:brightness-95"
                              title="Modifier la commande"
                            >
                              Modifier
                            </button>
                          )}
                          <button
                            onClick={() => setStatus(r.id, STATUS_NEXT[r.status])}
                            className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider ring-1 ${STATUS_BADGE_CLASS[r.status]} cursor-pointer hover:brightness-95`}
                            title="Cliquer pour faire avancer le statut"
                          >
                            {STATUS_LABEL[r.status]}
                          </button>
                        </div>
                        {r.status === "done" && (
                          <button
                            onClick={() => archiveOrder(r.id)}
                            className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ring-1 bg-muted text-foreground hover:brightness-95"
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
      <AlertDialog open={editConfirmId !== null} onOpenChange={(o) => !o && setEditConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifier la commande</AlertDialogTitle>
            <AlertDialogDescription>Êtes-vous sûr de vouloir modifier la commande ?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (editConfirmId) navigate({ to: "/admin/new-order", search: { orderId: editConfirmId } });
                setEditConfirmId(null);
              }}
            >
              Modifier
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
