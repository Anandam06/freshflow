import { useEffect, useMemo, type ReactNode } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import L, { type LatLngExpression, type LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Network } from "@/types/shipment";

export interface MapRoute {
  key: string;
  positions: LatLngTuple[];
  kind: "original" | "recommended" | "planned" | "preview";
  label: string;
}

const ROUTE_STYLE: Record<MapRoute["kind"], L.PathOptions> = {
  original: { color: "#64748b", weight: 6, opacity: 0.85 },
  planned: { color: "#1d4433", weight: 6, opacity: 0.85 },
  recommended: { color: "#0f8a7e", weight: 7, opacity: 0.95, dashArray: "1 12", lineCap: "round" },
  preview: { color: "#0f8a7e", weight: 6, opacity: 0.9 },
};

const CHANNEL_COLOR: Record<string, string> = { retail: "#2a78d6", horeca: "#c2410c", wholesale: "#7c3aed", processor: "#64748b" };

/** Road geometry for a hub→buyer route, optionally cut at the checkpoint and continued on a diversion leg. */
export function routeGeometry(network: Network, routeKey: string, divertTo?: string | null): LatLngTuple[] {
  const r = network.routes[routeKey];
  if (!r) return [];
  if (!divertTo) return r.geometry as LatLngTuple[];
  const idx = r.checkpoint_index ?? Math.floor(r.geometry.length * network.checkpoint_fraction);
  const leg = network.diversion_legs[routeKey]?.[divertTo];
  return [...(r.geometry.slice(0, idx) as LatLngTuple[]), ...(r.checkpoint ? [r.checkpoint as LatLngTuple] : []), ...((leg?.geometry ?? []) as LatLngTuple[])];
}

function FitBounds({ points }: { points: LatLngTuple[] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 13, animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

const iconCache = new Map<string, L.DivIcon>();
function imageIcon(src: string, size = 44, ring = "#d9822b") {
  const k = `${src}|${size}|${ring}`;
  if (!iconCache.has(k)) {
    iconCache.set(
      k,
      L.divIcon({
        className: "",
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:#fff;border:3px solid ${ring};box-shadow:0 4px 14px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center"><img src="${src}" alt="" style="width:${size * 0.66}px;height:${size * 0.66}px"/></div>`,
      }),
    );
  }
  return iconCache.get(k)!;
}

export function MumbaiMap({
  network,
  routes = [],
  originId,
  committedBuyerId,
  recommendedBuyerId,
  checkpoint,
  checkpointIcons = [],
  truck,
  onSelectBuyer,
  onSelectHub,
  buyerPopup,
  height = 520,
}: {
  network: Network;
  routes?: MapRoute[];
  originId?: string;
  committedBuyerId?: string;
  recommendedBuyerId?: string | null;
  checkpoint?: LatLngTuple | null;
  checkpointIcons?: string[];
  truck?: LatLngTuple | null;
  onSelectBuyer?: (id: string) => void;
  onSelectHub?: (id: string) => void;
  buyerPopup?: (id: string) => ReactNode;
  height?: number | string;
}) {
  const fitPoints = useMemo<LatLngTuple[]>(() => {
    const pts = routes.flatMap((r) => r.positions);
    if (pts.length > 1) return pts;
    return [...network.hubs, ...network.buyers].map((l) => [l.lat, l.lon] as LatLngTuple);
  }, [routes, network]);
  const center: LatLngExpression = [19.08, 72.95];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-forest/10 shadow-sm" style={{ height }} data-testid="mumbai-map">
      <MapContainer center={center} zoom={11} scrollWheelZoom={false} className="h-full w-full" attributionControl>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · routes: OSRM'
        />
        <FitBounds points={fitPoints} />
        {routes.map((r) => (
          <Polyline key={r.key + r.kind} positions={r.positions} pathOptions={ROUTE_STYLE[r.kind]}>
            <Tooltip sticky>{r.label}</Tooltip>
          </Polyline>
        ))}
        {network.hubs.map((h) => (
          <CircleMarker
            key={h.id}
            center={[h.lat, h.lon]}
            radius={h.id === originId ? 13 : 9}
            pathOptions={{ color: "#fff", weight: 3, fillColor: "#1d4433", fillOpacity: h.id === originId ? 1 : 0.7 }}
            eventHandlers={onSelectHub ? { click: () => onSelectHub(h.id) } : undefined}
          >
            <Tooltip direction="top" offset={[0, -8]} permanent={h.id === originId}>
              <span className="font-semibold">{h.name}</span>
            </Tooltip>
          </CircleMarker>
        ))}
        {network.buyers.map((b) => {
          const isCommitted = b.id === committedBuyerId;
          const isRecommended = b.id === recommendedBuyerId;
          return (
            <CircleMarker
              key={b.id}
              center={[b.lat, b.lon]}
              radius={isCommitted || isRecommended ? 12 : 8}
              pathOptions={{
                color: isRecommended ? "#0f8a7e" : isCommitted ? "#334155" : "#fff",
                weight: isCommitted || isRecommended ? 4 : 2,
                fillColor: CHANNEL_COLOR[b.channel ?? ""] ?? "#64748b",
                fillOpacity: 0.95,
              }}
              eventHandlers={onSelectBuyer ? { click: () => onSelectBuyer(b.id) } : undefined}
            >
              <Tooltip direction="top" offset={[0, -8]} permanent={isCommitted || isRecommended}>
                <span className="font-semibold">
                  {isRecommended ? "★ " : ""}
                  {b.name}
                </span>
              </Tooltip>
              {buyerPopup && <Popup minWidth={260}>{buyerPopup(b.id)}</Popup>}
            </CircleMarker>
          );
        })}
        {checkpoint && checkpointIcons.length > 0 && <Marker position={checkpoint} icon={imageIcon(checkpointIcons[0])} />}
        {truck && <Marker position={truck} icon={imageIcon("/icons/truck.png", 40, "#1d4433")} zIndexOffset={500} />}
      </MapContainer>
      <MapLegend />
    </div>
  );
}

function MapLegend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-xl bg-white/95 px-3 py-2 text-xs text-slate-700 shadow-md">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-forest" /> APMC hub
        </span>
        {Object.entries(CHANNEL_COLOR).map(([k, c]) => (
          <span key={k} className="flex items-center gap-1.5 capitalize">
            <span className="h-3 w-3 rounded-full" style={{ background: c }} /> {k === "horeca" ? "Hotels" : k}
          </span>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">Road routes: OpenStreetMap via OSRM · Traffic: simulated (not live) · Buyers: synthetic</p>
    </div>
  );
}
