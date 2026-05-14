import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/driver/today")({
  component: DriverToday,
});

interface DriverOrder {
  id: string;
  order_number: number;
  client_name: string;
  location_name: string;
  location_id: string;
  lat: number | null;
  lng: number | null;
  status: "todo" | "in_progress" | "done";
  delivered_at: string | null;
  delivery_date: string;
  note: string | null;
  containers: string | null;
  lines: { article_name: string; quantity: number }[];
}

const ARRIVAL_RADIUS_M = 60; // meters considered "on site"

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function DriverToday() {
  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Track per-location "currently on site" so we can detect departure
  const onSiteRef = useRef<Map<string, boolean>>(new Map());

  async function load() {
    const today = format(new Date(), "yyyy-MM-dd");
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, status, delivered_at, delivery_date, note, location_id, profiles(name), delivery_locations(name, lat, lng), order_lines(quantity, articles(name))")
      .eq("delivery_date", today)
      .eq("archived", false)
      .order("created_at", { ascending: true });
    if (error) { toast.error(error.message); setLoading(false); return; }
    setOrders((data ?? []).map((r: any) => ({
      id: r.id,
      order_number: r.order_number,
      client_name: r.profiles?.name ?? "—",
      location_name: r.delivery_locations?.name ?? "—",
      location_id: r.location_id,
      lat: r.delivery_locations?.lat ?? null,
      lng: r.delivery_locations?.lng ?? null,
      status: r.status,
      delivered_at: r.delivered_at,
      delivery_date: r.delivery_date,
      note: r.note,
      lines: (r.order_lines ?? []).map((l: any) => ({ article_name: l.articles?.name ?? "?", quantity: l.quantity })),
    })));
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("driver-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Watch GPS
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGeoError("Géolocalisation non disponible sur cet appareil.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGeoError(null);
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
      },
      (err) => setGeoError(err.message || "Position indisponible"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Auto-status logic based on position
  useEffect(() => {
    if (!pos) return;
    for (const o of orders) {
      if (o.lat == null || o.lng == null) continue;
      if (o.delivered_at) continue; // already delivered
      const d = distanceMeters(pos, { lat: o.lat, lng: o.lng });
      const wasOnSite = onSiteRef.current.get(o.location_id) === true;
      const isOnSite = d <= ARRIVAL_RADIUS_M;

      if (isOnSite && !wasOnSite) {
        onSiteRef.current.set(o.location_id, true);
        if (o.status === "todo") {
          // mark in_progress
          supabase.from("orders").update({ status: "in_progress" }).eq("id", o.id).then(({ error }) => {
            if (!error) setOrders(curr => curr.map(x => x.id === o.id ? { ...x, status: "in_progress" } : x));
          });
        }
      } else if (!isOnSite && wasOnSite) {
        onSiteRef.current.set(o.location_id, false);
        // departure → mark delivered
        const now = new Date().toISOString();
        supabase.from("orders").update({ status: "done", delivered_at: now }).eq("id", o.id).then(({ error }) => {
          if (!error) setOrders(curr => curr.map(x => x.id === o.id ? { ...x, status: "done", delivered_at: now } : x));
          else toast.error(error.message);
        });
      }
    }
  }, [pos, orders]);

  const sorted = useMemo(() => {
    if (!pos) return orders;
    return [...orders].sort((a, b) => {
      // delivered last
      if (!!a.delivered_at !== !!b.delivered_at) return a.delivered_at ? 1 : -1;
      const da = a.lat != null && a.lng != null ? distanceMeters(pos, { lat: a.lat, lng: a.lng }) : Infinity;
      const db = b.lat != null && b.lng != null ? distanceMeters(pos, { lat: b.lat, lng: b.lng }) : Infinity;
      return da - db;
    });
  }, [orders, pos]);

  function statusBadge(o: DriverOrder) {
    if (o.delivered_at) {
      return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-blue-600 text-white ring-1 ring-blue-700">Livrée</span>;
    }
    if (o.status === "in_progress") {
      return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 ring-1 ring-amber-300">Sur place</span>;
    }
    if (o.status === "done") {
      return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-green-100 text-green-900 ring-1 ring-green-300">Terminée</span>;
    }
    return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-muted text-foreground ring-1 ring-border">À livrer</span>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tournée du {format(new Date(), "EEEE d MMMM", { locale: fr })}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {pos
              ? <>Position GPS active · précision ±{Math.round(pos.accuracy)} m</>
              : geoError
                ? <span className="text-destructive">{geoError}</span>
                : <>Acquisition de la position…</>}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" /> En direct
        </span>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Chargement…</div>}
      {!loading && sorted.length === 0 && (
        <div className="rounded-xl ring-1 ring-black/5 bg-card p-12 text-center text-muted-foreground">
          Aucune commande à livrer aujourd'hui.
        </div>
      )}

      <div className="grid gap-3">
        {sorted.map(o => {
          const dist = pos && o.lat != null && o.lng != null ? distanceMeters(pos, { lat: o.lat, lng: o.lng }) : null;
          return (
            <div key={o.id} className={`rounded-xl ring-1 ring-black/5 shadow-sm px-4 py-2.5 ${o.delivered_at ? "bg-blue-50" : "bg-card"}`}>
              {/* Ligne 1 : Lieu + Note + Statut */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base font-bold truncate">{o.location_name}</span>
                  {o.note && (
                    <span
                      title={o.note}
                      className="inline-flex items-center max-w-[40vw] truncate text-[11px] bg-amber-50 border border-amber-200 text-amber-900 rounded px-1.5 py-0.5"
                    >
                      📝 {o.note}
                    </span>
                  )}
                </div>
                <div className="shrink-0">{statusBadge(o)}</div>
              </div>
              {/* Ligne 2 : Client/#n° · distance · actions */}
              <div className="mt-1 flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground truncate">
                  {o.client_name} · #{o.order_number}
                  {dist != null && !o.delivered_at && (
                    <span className="ml-2 tabular-nums">· {dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(1)} km`}</span>
                  )}
                  {o.lat == null && <span className="ml-2 text-amber-700">· GPS non défini</span>}
                  {o.delivered_at && (
                    <span className="ml-2 text-blue-700 tabular-nums">· {format(new Date(o.delivered_at), "HH:mm")}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setExpandedId(o.id)}
                    className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-semibold bg-muted hover:bg-muted/70 text-foreground transition-colors"
                  >
                    Développer
                  </button>
                  {!o.delivered_at && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm(`Marquer la commande #${o.order_number} comme livrée ?`)) return;
                        const now = new Date().toISOString();
                        const { error } = await supabase.from("orders").update({ status: "done", delivered_at: now }).eq("id", o.id);
                        if (error) { toast.error(error.message); return; }
                        onSiteRef.current.set(o.location_id, false);
                        setOrders(curr => curr.map(x => x.id === o.id ? { ...x, status: "done", delivered_at: now } : x));
                        toast.success("Commande marquée livrée");
                      }}
                      className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      ✓ Livrée
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={expandedId !== null} onOpenChange={(o) => { if (!o) setExpandedId(null); }}>
        <DialogContent className="max-w-md">
          {(() => {
            const o = orders.find(x => x.id === expandedId);
            if (!o) return null;
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{o.location_name} · #{o.order_number}</DialogTitle>
                </DialogHeader>
                <div className="text-xs text-muted-foreground -mt-1">{o.client_name}</div>
                {o.note && (
                  <div className="text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1">📝 {o.note}</div>
                )}
                <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-1">
                  {o.lines.filter(l => l.quantity > 0).map((l, i) => (
                    <li key={i} className="flex justify-between border-b border-dashed border-border/60 py-0.5">
                      <span className="truncate">{l.article_name}</span>
                      <span className="font-bold tabular-nums">{l.quantity}</span>
                    </li>
                  ))}
                  {o.lines.filter(l => l.quantity > 0).length === 0 && (
                    <li className="col-span-2 text-muted-foreground italic">Aucun article</li>
                  )}
                </ul>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
