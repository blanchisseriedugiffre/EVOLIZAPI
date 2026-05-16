import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default icon issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const doneIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

const todoIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

const inProgressIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

const myPosIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
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

function FitBounds({ points, pos }: { points: DeliveryPoint[]; pos: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    const all: [number, number][] = points
      .filter(p => p.lat != null && p.lng != null)
      .map(p => [p.lat, p.lng]);
    if (pos) all.push([pos.lat, pos.lng]);
    if (all.length > 0) map.fitBounds(all, { padding: [40, 40] });
  }, [points.length, !!pos]);
  return null;
}

interface Props {
  points: DeliveryPoint[];
  pos: { lat: number; lng: number } | null;
}

export default function DriverMap({ points, pos }: Props) {
  return (
    <MapContainer
      center={[46.8, 2.3]}
      zoom={6}
      style={{ height: "100%", width: "100%" }}
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} pos={pos} />

      {pos && (
        <Marker position={[pos.lat, pos.lng]} icon={myPosIcon}>
          <Popup>📍 Ma position</Popup>
        </Marker>
      )}

      {points.map(p => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={p.delivered_at ? doneIcon : p.status === "in_progress" ? inProgressIcon : todoIcon}
        >
          <Popup>
            <div className="text-sm space-y-0.5">
              <div className="font-bold">{p.location_name}</div>
              <div className="text-muted-foreground">{p.client_name} · #{p.order_number}</div>
              <div className="mt-1">
                {p.delivered_at
                  ? <span className="text-blue-600 font-semibold">✓ Livrée</span>
                  : p.status === "in_progress"
                    ? <span className="text-orange-500 font-semibold">⏳ Sur place</span>
                    : <span className="text-red-500 font-semibold">📦 À livrer</span>}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
