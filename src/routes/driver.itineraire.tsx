import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/driver/itineraire")({
  component: DriverRoute,
});

interface DeliveryPoint {
  id: string;
  order_number: number;
  client_name: string;
  location_name: string;
  lat: number;
  lng: number;
  status: "todo" | "in_progress" | "done";
  delivered_at: string | null;
}

// Lazy-load the map component to avoid SSR issues with Leaflet
const MapView = lazy(() => import("@/components/DriverMap"));

export function DriverRoute() {
  const [points, setPoints] = useState<DeliveryPoint[]>([]);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => { setIsClient(true); }, []);

  async function load() {
    const today = format(new Date(), "yyyy-MM-dd");
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, status, delivered_at, location_id, profiles(name), delivery_locations(name, lat, lng)")
      .eq("delivery_date", today)
      .eq("archived", false);
    if (error) { toast.error(error.message); setLoading(false); return; }
    const mapped = (data ?? [])
      .map((r: any) => ({
        id: r.id,
        order_number: r.order_number,
        client_name: r.profiles?.name ?? "—",
        location_name: r.delivery_locations?.name ?? "—",
        lat: r.delivery_locations?.lat ?? null,
        lng: r.delivery_locations?.lng ?? null,
        status: r.status,
        delivered_at: r.delivered_at,
      }))
      .filter((p: any) => p.lat != null && p.lng != null) as DeliveryPoint[];
    setPoints(mapped);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("driver-route")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    if (!("geolocation" in navigator)) { setGeoError("Géolocalisation non disponible."); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => { setGeoError(null); setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      (err) => setGeoError(err.message || "Position indisponible"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const todo = points.filter(p => !p.delivered_at).length;
  const done = points.filter(p => !!p.delivered_at).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Itinéraire du {format(new Date(), "EEEE d MMMM", { locale: fr })}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {pos
            ? <>Position GPS active</>
            : geoError
              ? <span className="text-destructive">{geoError}</span>
              : <>Acquisition de la position…</>}
          {points.length > 0 && (
            <span className="ml-3">
              · <span className="text-green-700 font-medium">{done} livrée{done > 1 ? "s" : ""}</span>
              {" · "}
              <span className="font-medium">{todo} restante{todo > 1 ? "s" : ""}</span>
            </span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> À livrer</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-400 inline-block" /> Sur place</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Livrée</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Ma position</span>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Chargement…</div>}

      {!loading && isClient && (
        <div className="rounded-xl overflow-hidden ring-1 ring-black/10 shadow-sm" style={{ height: "65vh" }}>
          <Suspense fallback={<div className="h-full grid place-items-center text-sm text-muted-foreground">Chargement de la carte…</div>}>
            <MapView points={points} pos={pos} />
          </Suspense>
        </div>
      )}

      {!loading && points.length === 0 && (
        <div className="rounded-xl ring-1 ring-black/5 bg-card p-12 text-center text-muted-foreground">
          Aucun point de livraison avec coordonnées GPS aujourd'hui.
        </div>
      )}
    </div>
  );
}
