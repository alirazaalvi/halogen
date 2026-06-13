import { MapContainer, TileLayer, Marker, Circle, Popup } from "react-leaflet";
import L from "leaflet";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

const defaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

interface CrimePoint {
  position: [number, number];
  incidents: number;
}

interface PricePoint {
  position: [number, number];
  pricePerSqm: number;
}

interface Props {
  center: [number, number];
  zoom?: number;
  height?: number | string;
  markers?: { position: [number, number]; label?: string }[];
  ring?: boolean;
  crimePoints?: CrimePoint[];
  pricePoints?: PricePoint[];
  showCrime?: boolean;
  showPrices?: boolean;
}

export function AreaMap({ center, zoom = 13, height = 360, markers = [], ring = true, crimePoints = [], pricePoints = [], showCrime = false, showPrices = false }: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border" style={{ height }}>
      <MapContainer center={center} zoom={zoom} style={{ width: "100%", height: "100%" }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {ring && <Circle center={center} radius={700} pathOptions={{ color: "#3b6fb8", weight: 1.5, fillOpacity: 0.08 }} />}

        {showCrime && crimePoints.map((cp, i) => (
          <Circle
            key={`crime-${i}`}
            center={cp.position}
            radius={40 + cp.incidents / 2}
            pathOptions={{ color: getCrimeColor(cp.incidents), fillOpacity: 0.3 }}
          >
            <Popup>Incidents: {cp.incidents}</Popup>
          </Circle>
        ))}

        {showPrices && pricePoints.map((pp, i) => (
          <Circle
            key={`price-${i}`}
            center={pp.position}
            radius={60}
            pathOptions={{ color: getPriceColor(pp.pricePerSqm), fillOpacity: 0.2 }}
          >
            <Popup>Price: {pp.pricePerSqm.toLocaleString()} SEK/sqm</Popup>
          </Circle>
        ))}

        <Marker position={center}>
          <Popup>Area center</Popup>
        </Marker>
        {markers.map((m, i) => (
          <Marker key={i} position={m.position}>
            {m.label && <Popup>{m.label}</Popup>}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

function getCrimeColor(incidents: number): string {
  if (incidents > 50) return "#ef4444";
  if (incidents > 20) return "#f59e0b";
  return "#22c55e";
}

function getPriceColor(pricePerSqm: number): string {
  if (pricePerSqm > 80000) return "#ef4444";
  if (pricePerSqm > 50000) return "#f59e0b";
  return "#22c55e";
}