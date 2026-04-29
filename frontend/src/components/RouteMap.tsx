import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import type { TimelineEvent } from "../types/api";

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface RouteMapProps {
  events: TimelineEvent[];
}

type MarkerType = "driving" | "stop" | "milestone";

interface LocationMarker {
  key: string;
  location: string;
  remark: string;
  lat: number;
  lng: number;
  type: MarkerType;
}


function colorForType(type: MarkerType): string {
  if (type === "milestone") return "#16a34a";
  if (type === "stop") return "#dc2626";
  return "#2563eb";
}

function buildIcon(type: MarkerType) {
  return L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;border-radius:9999px;background:${colorForType(
      type,
    )};border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,.2)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function MapBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  if (points.length > 0) {
    map.fitBounds(points, { padding: [24, 24] });
  }
  return null;
}

function markerType(event: TimelineEvent): MarkerType {
  const remark = event.remark.toLowerCase();
  if (remark.includes("pickup") || remark.includes("dropoff")) return "milestone";
  if (remark.includes("break") || remark.includes("rest")) return "stop";
  return "driving";
}

export function RouteMap({ events }: RouteMapProps) {
  const markers = useMemo(() => {
    const deduped = new Map<string, LocationMarker>();
    events.forEach((event, index) => {
      if (event.lat === 0 && event.lng === 0) return;
      if (!deduped.has(event.location)) {
        deduped.set(event.location, {
          key: `${event.location}-${index}`,
          location: event.location,
          remark: event.remark,
          lat: event.lat,
          lng: event.lng,
          type: markerType(event),
        });
      }
    });
    return Array.from(deduped.values());
  }, [events]);

  const routeCoordinates = useMemo<[number, number][]>(
    () =>
      events
        .filter((e) => e.lat !== 0 || e.lng !== 0)
        .map((e) => [e.lat, e.lng] as [number, number]),
    [events],
  );

  const points: [number, number][] = markers.map((m) => [m.lat, m.lng]);
  const boundsPoints = routeCoordinates.length > 0 ? routeCoordinates : points;

  return (
    <div className="rounded-xl bg-white p-4 shadow-lg">
      <h2 className="mb-3 text-xl font-semibold text-gray-900">Route Map</h2>
      <div className="h-96 overflow-hidden rounded-lg border border-gray-200">
        <MapContainer center={[39.5, -98.35]} zoom={4} className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {routeCoordinates.length > 1 ? (
            <Polyline
              positions={routeCoordinates}
              pathOptions={{ color: "#3B82F6", weight: 3, opacity: 0.7 }}
            />
          ) : null}
          {markers.map((marker) => (
            <Marker
              key={marker.key}
              position={[marker.lat, marker.lng]}
              icon={buildIcon(marker.type)}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">{marker.location}</p>
                  <p className="text-gray-600">{marker.remark}</p>
                </div>
              </Popup>
            </Marker>
          ))}
          <MapBounds points={boundsPoints} />
        </MapContainer>
      </div>
    </div>
  );
}
