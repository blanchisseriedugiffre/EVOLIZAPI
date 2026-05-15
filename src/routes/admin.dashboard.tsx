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
  delivered_at: string | null;
  containers: string | null;
  note: string | null;
  note_seen_by_admin: boolean;
  lines: { article_id: string; article_name: string; quantity: number }[];
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char] ?? char);
}

function Dashboard() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [editConfirmId, setEditConfirmId] = useState<string | null>(null);
  const [containersPromptId, setContainersPromptId] = useState<string | null>(null);
  const [containersValue, setContainersValue] = useState("");
  const [articles, setArticles] = useState<{ id: string; name: string }[]>([]);
  const [filter, setFilter] = useState<"all" | OrderStatus>("all");
  const [loading, setLoading] = useState(true);

  async function load() {
    const [{ data: o }, { data: arts }] = await Promise.all([
      supabase
        .from("orders")
        .select("id, order_number, delivery_date, created_at, status, delivered_at, containers, note, note_seen_by_admin, profiles(name), delivery_locations(name), order_lines(article_id, quantity, articles(name))")
        .eq("archived", false)
        .order("delivery_date", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase.from("articles").select("id, name").order("name"),
    ]);
    const sorted = [...(arts ?? [])];
    const seIdx = sorted.findIndex(a => a.name === "SE");
    const dbIdx = sorted.findIndex(a => a.name === "DB");
    if (seIdx !== -1 && dbIdx !== -1 && seIdx !== dbIdx + 1) {
      const [se] = sorted.splice(seIdx, 1);
      const newDbIdx = sorted.findIndex(a => a.name === "DB");
      sorted.splice(newDbIdx + 1, 0, se);
    }
    setArticles(sorted);
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
        containers: r.containers ?? null,
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
    setRows(current => current.map(row => row.id === id ? { ...row, status } : row));
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
    }
  }

  function advanceStatus(r: Row) {
    const next = STATUS_NEXT[r.status];
    if (r.status === "in_progress" && next === "done") {
      setContainersValue("");
      setContainersPromptId(r.id);
      return;
    }
    setStatus(r.id, next);
  }

  async function finalizeDone(id: string, containers: string | null) {
    const row = rows.find(r => r.id === id);
    const shouldAdvance = row?.status !== "done";
    setRows(current => current.map(r => r.id === id ? { ...r, status: shouldAdvance ? "done" : r.status, containers: containers ?? r.containers } : r));
    const payload: { status?: OrderStatus; containers?: string | null } = {};
    if (shouldAdvance) payload.status = "done";
    if (containers !== null) payload.containers = containers;
    if (Object.keys(payload).length > 0) {
      const { error } = await supabase.from("orders").update(payload).eq("id", id);
      if (error) {
        toast.error(error.message);
        load();
      }
    }
    setContainersPromptId(null);
    setContainersValue("");
  }

  function openContainersEditor(r: Row) {
    setContainersValue(r.containers ?? "");
    setContainersPromptId(r.id);
  }

  async function markDelivered(id: string, orderNumber: number) {
    if (!confirm(`Marquer la commande #${orderNumber} comme livrée ?`)) return;
    const now = new Date().toISOString();
    setRows(current => current.map(row => row.id === id ? { ...row, status: "done", delivered_at: now } : row));
    const { error } = await supabase.from("orders").update({ status: "done", delivered_at: now }).eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
    } else {
      toast.success("Commande marquée livrée");
    }
  }

  function printOrder(r: Row) {
    const printedStatus: OrderStatus = "in_progress";
    if (r.status !== printedStatus) setStatus(r.id, printedStatus);

    const dateLivr = format(new Date(r.delivery_date), "EEEE d MMMM yyyy", { locale: fr });
    const dateCmd = format(new Date(r.created_at), "d MMM yyyy 'à' HH:mm", { locale: fr });
    const lines = r.lines
      .filter(l => l.quantity > 0)
      .map(l => `<tr><td style="padding:7px 6px;border-bottom:1px dashed #999;font-weight:bold">${escapeHtml(l.article_name)}</td><td style="padding:7px 6px;border-bottom:1px dashed #999;text-align:right;font-weight:bold">${escapeHtml(l.quantity)}</td></tr>`)
      .join("");
    const noteHtml = r.note ? `<div style="margin-top:8px;padding:6px;border:1px dashed #000"><b>Note:</b> ${escapeHtml(r.note)}</div>` : "";
    const ticketHtml = `<div style="font-family:-apple-system,system-ui,sans-serif;font-size:12px;color:#000;margin:0;padding:2px;width:76mm;background:#fff">
  <h1 style="font-size:16px;margin:0 0 6px;text-align:center">Commande #${escapeHtml(r.order_number)}</h1>
  <hr/>
  <div style="margin:2px 0"><span style="font-weight:600;text-transform:uppercase;font-size:10px;color:#444">Lieu:</span> <b style="font-size:21px">${escapeHtml(r.location_name)}</b></div>
  <div style="margin:2px 0"><span style="font-weight:600;text-transform:uppercase;font-size:10px;color:#444">Client:</span> ${escapeHtml(r.client_name)}</div>
  <div style="margin:2px 0"><span style="font-weight:600;text-transform:uppercase;font-size:10px;color:#444">Livraison:</span> <b>${escapeHtml(dateLivr)}</b></div>
  <div style="margin:2px 0"><span style="font-weight:600;text-transform:uppercase;font-size:10px;color:#444">Commandé le:</span> ${escapeHtml(dateCmd)}</div>
  <div style="margin:2px 0"><span style="font-weight:600;text-transform:uppercase;font-size:10px;color:#444">Statut:</span> ${escapeHtml(STATUS_LABEL[printedStatus])}</div>
  ${noteHtml}
  <table style="width:100%;border-collapse:collapse;margin-top:8px">
    <thead><tr><th style="text-align:left;padding:4px 6px;border-bottom:2px solid #000;font-size:11px">Article</th><th style="text-align:right;padding:4px 6px;border-bottom:2px solid #000;font-size:11px">Qté</th></tr></thead>
    <tbody>${lines || '<tr><td colspan="2" style="padding:6px;text-align:center;color:#666">Aucun article</td></tr>'}</tbody>
  </table>
</div>`;

    document.getElementById("print-ticket-root")?.remove();
    document.getElementById("print-ticket-style")?.remove();

    const style = document.createElement("style");
    style.id = "print-ticket-style";
    style.textContent = `@media screen{#print-ticket-root{display:none!important}}@media print{@page{size:80mm auto;margin:2mm}html,body{background:#fff!important;margin:0!important;padding:0!important;height:auto!important;min-height:0!important;overflow:hidden!important}body>*{display:none!important}body>#print-ticket-root{display:block!important;position:static!important;margin:0!important;padding:0!important;width:76mm!important;height:auto!important;page-break-after:avoid!important;break-after:avoid!important;page-break-inside:avoid!important;break-inside:avoid!important}#print-ticket-root *{page-break-inside:avoid!important;break-inside:avoid!important;box-shadow:none!important}}`;

    const root = document.createElement("div");
    root.id = "print-ticket-root";
    root.innerHTML = ticketHtml;
    document.body.append(style, root);

    let fallbackCleanup: number | undefined;
    const cleanup = () => {
      if (fallbackCleanup) window.clearTimeout(fallbackCleanup);
      window.removeEventListener("afterprint", cleanup);
      root.remove();
      style.remove();
    };

    window.addEventListener("afterprint", cleanup, { once: true });
    fallbackCleanup = window.setTimeout(cleanup, 60000);
    try {
      window.print();
    } catch (error) {
      cleanup();
      toast.error("Impossible de lancer l'impression");
    }
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
          <table className="w-full text-left border-collapse text-sm table-fixed">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="py-3 px-2 w-20 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Date livr.</th>
                <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Client / Lieu</th>
                <th className="py-2 px-0 w-7 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center"></th>
                {articles.map(a => (
                  <th key={a.id} className="py-2 px-0 w-7 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center align-bottom" title={a.name}>
                    <div className="inline-block whitespace-nowrap [writing-mode:vertical-rl] rotate-180 leading-tight">
                      {a.name}
                    </div>
                  </th>
                ))}
                <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && <tr><td colSpan={3 + articles.length} className="py-12 text-center text-muted-foreground">Chargement…</td></tr>}
              {!loading && visible.length === 0 && (
                <tr><td colSpan={3 + articles.length} className="py-12 text-center text-muted-foreground">Aucune commande.</td></tr>
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
                      <div className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">#{r.order_number} · {format(new Date(r.created_at), "d MMM yy", { locale: fr })} {format(new Date(r.created_at), "HH:mm")}</div>
                    </td>
                    <td className="py-3 px-0 align-middle text-center">
                      {r.note && <AdminNoteCell orderId={r.id} note={r.note} seen={r.note_seen_by_admin} />}
                    </td>
                    {articles.map(a => (
                      <td key={a.id} className="py-3 px-0 text-center align-top tabular-nums text-sm">
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
                          {(r.status === "in_progress" || r.status === "done") && (
                            <button
                              type="button"
                              onClick={() => openContainersEditor(r)}
                              className="inline-flex items-center justify-center px-2 py-0.5 min-w-[28px] rounded-md text-[10px] font-semibold uppercase tracking-wider ring-1 ring-border bg-background text-foreground tabular-nums hover:brightness-95"
                              title="Nbre de chariots/sacs (cliquer pour modifier)"
                            >
                              {r.containers || <span className="text-muted-foreground/50">·</span>}
                            </button>
                          )}
                          {r.delivered_at ? (
                            <span
                              className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider ring-1 bg-blue-600 text-white ring-blue-700"
                              title={`Livrée à ${format(new Date(r.delivered_at), "HH:mm")}`}
                            >
                              Livrée
                            </span>
                          ) : (
                            <button
                              onClick={() => advanceStatus(r)}
                              className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider ring-1 ${STATUS_BADGE_CLASS[r.status]} cursor-pointer hover:brightness-95`}
                              title="Cliquer pour faire avancer le statut"
                            >
                              {STATUS_LABEL[r.status]}
                            </button>
                          )}
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
      <AlertDialog open={containersPromptId !== null} onOpenChange={(o) => { if (!o) { setContainersPromptId(null); setContainersValue(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nbre de chariots ou sacs ?</AlertDialogTitle>
            <AlertDialogDescription>Saisissez une valeur (3 caractères max) ou ignorez.</AlertDialogDescription>
          </AlertDialogHeader>
          <input
            type="text"
            maxLength={3}
            value={containersValue}
            onChange={(e) => setContainersValue(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 3))}
            autoFocus
            placeholder="ex: 3"
            className="w-full px-3 py-2 text-center text-lg font-mono rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            onKeyDown={(e) => {
              if (e.key === "Enter" && containersPromptId) {
                e.preventDefault();
                finalizeDone(containersPromptId, containersValue.trim() || null);
              }
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => containersPromptId && finalizeDone(containersPromptId, null)}>
              Ignorer
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => containersPromptId && finalizeDone(containersPromptId, containersValue.trim() || null)}
            >
              Valider
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
