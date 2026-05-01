import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { LocationType, PickedLocation, TimelineEvent } from "../types/api";

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface RouteMapProps {
  events: TimelineEvent[];
  pickingMode?: LocationType | null;
  pickedLocations?: Partial<Record<LocationType, PickedLocation>>;
  onModeChange?: (mode: LocationType | null) => void;
  onLocationPicked?: (type: LocationType, lat: number, lng: number) => void;
  viewResetKey?: number;
}

const PICKED_COLORS: Record<LocationType, string> = {
  current: "#2563eb",
  pickup: "#16a34a",
  dropoff: "#dc2626",
};

const PICKED_LABELS: Record<LocationType, string> = {
  current: "Start",
  pickup: "Pickup",
  dropoff: "Dropoff",
};

function buildPickedIcon(type: LocationType): L.DivIcon {
  const color = PICKED_COLORS[type];
  return L.divIcon({
    className: "",
    html: `<div style="width:22px;height:22px;border-radius:9999px;background:${color};border:3px solid white;box-shadow:0 0 0 2px rgba(0,0,0,.25)"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function MapClickHandler({
  mode,
  onPick,
}: {
  mode: LocationType | null;
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (mode) {
        onPick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
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

function MapBounds({
  points,
  enabled,
}: {
  points: [number, number][];
  enabled: boolean;
}) {
  const map = useMap();
  // Stable string key: changes only when the actual route coordinates change.
  // Using an empty string when disabled prevents fitBounds from firing on
  // pin drops or picking-mode changes — only a new planned route triggers it.
  const routeKey = enabled ? points.map((p) => p.join(",")).join("|") : "";
  useEffect(() => {
    if (enabled && points.length > 0) {
      map.fitBounds(points, { padding: [24, 24] });
    }
    // routeKey is the stable proxy for points + enabled; map is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, map]);
  return null;
}

function ResetView({ trigger }: { trigger: number }) {
  const map = useMap();
  useEffect(() => {
    if (trigger > 0) {
      map.setView([39.5, -98.35], 4);
    }
  }, [trigger, map]);
  return null;
}

const TYPE_PRIORITY: Record<MarkerType, number> = {
  milestone: 3,
  stop: 2,
  driving: 1,
};

function markerType(event: TimelineEvent): MarkerType {
  const remark = event.remark.toLowerCase();
  if (remark.includes("pickup") || remark.includes("dropoff")) return "milestone";
  if (remark.includes("break") || remark.includes("rest")) return "stop";
  return "driving";
}

export function RouteMap({
  events,
  pickingMode = null,
  pickedLocations,
  onModeChange,
  onLocationPicked,
  viewResetKey = 0,
}: RouteMapProps) {
  const pickerEnabled = Boolean(onModeChange && onLocationPicked);
  const pickedEntries = pickedLocations
    ? (Object.entries(pickedLocations) as Array<[LocationType, PickedLocation | undefined]>)
        .filter(([, v]) => v !== undefined)
    : [];

  const markers = useMemo(() => {
    const deduped = new Map<string, LocationMarker>();
    events.forEach((event, index) => {
      if (event.lat === 0 && event.lng === 0) return;
      const type = markerType(event);
      const existing = deduped.get(event.location);
      if (!existing || TYPE_PRIORITY[type] > TYPE_PRIORITY[existing.type]) {
        deduped.set(event.location, {
          key: `${event.location}-${index}`,
          location: event.location,
          remark: event.remark,
          lat: event.lat,
          lng: event.lng,
          type,
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

  // Auto-fit only after a trip is planned. Pin drops must never move the map.
  const fitEnabled = events.length > 0;

  const noPinsSet = pickedEntries.length === 0;
  const noRoute = events.length === 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Route Map</h2>
        {events.length > 0 ? (
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
            Route planned
          </span>
        ) : null}
      </div>

      {pickerEnabled ? (
        <div className="mb-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {(["current", "pickup", "dropoff"] as LocationType[]).map((type) => {
              const active = pickingMode === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onModeChange?.(active ? null : type)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "border-blue-600 bg-blue-600 text-white shadow-sm dark:border-blue-400 dark:bg-blue-500"
                      : "border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:bg-blue-50/40 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:border-blue-400 dark:hover:bg-blue-500/10"
                  }`}
                >
                  {type === "current"
                    ? "📍 Set Start"
                    : type === "pickup"
                      ? "🟢 Set Pickup"
                      : "🔴 Set Dropoff"}
                </button>
              );
            })}
            {pickingMode ? (
              <span className="self-center text-xs font-medium text-blue-600 dark:text-blue-300">
                Click the map to set {pickingMode} location
              </span>
            ) : null}
          </div>
          {!pickingMode && noPinsSet && noRoute ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Click the buttons above to set locations on the map, or type city
              names in the form.
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        className="h-96 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700"
        style={{ cursor: pickingMode ? "crosshair" : "default" }}
      >
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
          {pickedEntries.map(([type, picked]) =>
            picked ? (
              <Marker
                key={`picked-${type}`}
                position={[picked.lat, picked.lng]}
                icon={buildPickedIcon(type)}
              >
                <Popup>
                  <div className="text-sm">
                    <p className="font-semibold">{PICKED_LABELS[type]}</p>
                    <p className="text-gray-600">{picked.label}</p>
                  </div>
                </Popup>
              </Marker>
            ) : null,
          )}
          {pickerEnabled ? (
            <MapClickHandler
              mode={pickingMode}
              onPick={(lat, lng) => {
                if (pickingMode && onLocationPicked) {
                  onLocationPicked(pickingMode, lat, lng);
                }
              }}
            />
          ) : null}
          <MapBounds points={routeCoordinates} enabled={fitEnabled} />
          <ResetView trigger={viewResetKey} />
        </MapContainer>
      </div>
    </div>
  );
}
