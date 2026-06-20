import { useEffect, useRef } from "react";

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

export function AreaMap({
  center,
  zoom = 13,
  height = 360,
  markers = [],
  ring = true,
  crimePoints = [],
  pricePoints = [],
  showCrime = false,
  showPrices = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    async function init() {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      const iconUrl = (await import("leaflet/dist/images/marker-icon.png")).default;
      const iconRetinaUrl = (await import("leaflet/dist/images/marker-icon-2x.png")).default;
      const shadowUrl = (await import("leaflet/dist/images/marker-shadow.png")).default;

      if (cancelled || !containerRef.current) return;

      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
      }

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

      const map = L.map(containerRef.current).setView(center, zoom);
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);

      if (ring) {
        L.circle(center, { radius: 700, color: "#3b6fb8", weight: 1.5, fillOpacity: 0.08 }).addTo(
          map,
        );
      }

      L.marker(center).bindPopup("Area center").addTo(map);

      for (const m of markers) {
        const mk = L.marker(m.position);
        if (m.label) mk.bindPopup(m.label);
        mk.addTo(map);
      }

      if (showCrime) {
        for (const cp of crimePoints) {
          L.circle(cp.position, {
            radius: 40 + cp.incidents / 2,
            color: getCrimeColor(cp.incidents),
            fillOpacity: 0.3,
          })
            .bindPopup(`Incidents: ${cp.incidents}`)
            .addTo(map);
        }
      }

      if (showPrices) {
        for (const pp of pricePoints) {
          L.circle(pp.position, {
            radius: 60,
            color: getPriceColor(pp.pricePerSqm),
            fillOpacity: 0.2,
          })
            .bindPopup(`Price: ${pp.pricePerSqm.toLocaleString()} SEK/sqm`)
            .addTo(map);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
      }
    };
  }, [center, zoom, markers, ring, crimePoints, pricePoints, showCrime, showPrices]);

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-2xl border border-border"
      style={{ height }}
    />
  );
}
