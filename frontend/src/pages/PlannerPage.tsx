import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import axios, { type AxiosError } from "axios";
import { TripInputForm } from "../components/TripInputForm";
import { RouteMap } from "../components/RouteMap";
import { TimelineView } from "../components/TimelineView";
import { LogSheet } from "../components/LogSheet";
import { planTrip } from "../lib/api";
import type {
  LocationType,
  PickedLocation,
  TripPlanRequest,
  TripPlanResponse,
} from "../types/api";

interface ApiErrorBody {
  message?: string;
  error?: string;
}

function parseError(error: unknown): string {
  const axiosError = error as AxiosError<ApiErrorBody>;
  return (
    axiosError.response?.data?.message ||
    axiosError.response?.data?.error ||
    "Unable to plan trip. Please verify inputs and try again."
  );
}

function Spinner() {
  return (
    <svg
      className="h-10 w-10 animate-spin text-blue-500"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function LoadingPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-96 flex-col items-center justify-center gap-3 rounded-xl bg-white shadow-lg">
      <Spinner />
      <p className="text-sm font-medium text-gray-500">{label}</p>
    </div>
  );
}

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export function PlannerPage() {
  const [result, setResult] = useState<TripPlanResponse | null>(null);
  const [pickingMode, setPickingMode] = useState<LocationType | null>(null);
  const [pickedLocations, setPickedLocations] = useState<
    Partial<Record<LocationType, PickedLocation>>
  >({});
  const [resetKey, setResetKey] = useState(0);

  const mutation = useMutation({
    mutationFn: planTrip,
    onSuccess: (data) => setResult(data),
  });

  const isLoading = mutation.isPending;

  const handleReset = () => {
    setResult(null);
    setPickedLocations({});
    setPickingMode(null);
    mutation.reset();
    setResetKey((k) => k + 1);
  };

  const handleLocationPicked = async (type: LocationType, lat: number, lng: number) => {
    let label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    try {
      const res = await axios.get<{ label: string }>(`${API_BASE}/api/geocode/reverse/`, {
        params: { lat, lng },
      });
      if (res.data?.label) {
        label = res.data.label;
      }
    } catch {
      // Network/lookup failed — keep the lat/lng fallback label set above.
    }
    setPickedLocations((prev) => ({ ...prev, [type]: { lat, lng, label } }));
    setPickingMode(null);
  };

  const handleSubmit = (formData: TripPlanRequest) => {
    const enrichedData: TripPlanRequest = {
      ...formData,
      ...(pickedLocations.current && {
        current_lat: pickedLocations.current.lat,
        current_lng: pickedLocations.current.lng,
        current_location: pickedLocations.current.label,
      }),
      ...(pickedLocations.pickup && {
        pickup_lat: pickedLocations.pickup.lat,
        pickup_lng: pickedLocations.pickup.lng,
        pickup_location: pickedLocations.pickup.label,
      }),
      ...(pickedLocations.dropoff && {
        dropoff_lat: pickedLocations.dropoff.lat,
        dropoff_lng: pickedLocations.dropoff.lng,
        dropoff_location: pickedLocations.dropoff.label,
      }),
    };
    mutation.mutate(enrichedData);
  };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-gray-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-xl bg-white p-6 shadow-lg">
          <h1 className="text-3xl font-bold">Spotter ELD</h1>
          <p className="mt-1 text-gray-600">
            Trip planner for property-carrying truck drivers with FMCSA-compliant daily logs.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-2">
          <TripInputForm
            onSubmit={handleSubmit}
            isLoading={isLoading}
            errorMessage={mutation.isError ? parseError(mutation.error) : undefined}
            pickedLocations={pickedLocations}
            resetKey={resetKey}
          />

          {isLoading ? (
            <LoadingPlaceholder label="Calculating route…" />
          ) : (
            <RouteMap
              events={result?.timeline ?? []}
              pickingMode={pickingMode}
              pickedLocations={pickedLocations}
              onModeChange={setPickingMode}
              onLocationPicked={handleLocationPicked}
              viewResetKey={resetKey}
            />
          )}
        </section>

        {isLoading ? (
          <div className="space-y-6">
            <LoadingPlaceholder label="Building timeline…" />
            <LoadingPlaceholder label="Generating ELD log sheets…" />
          </div>
        ) : result ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-700">Trip Results</h2>
              <button
                type="button"
                onClick={handleReset}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:border-red-400 hover:bg-red-50 hover:text-red-600"
              >
                ← Plan New Trip
              </button>
            </div>
            <TimelineView logSheets={result.log_sheets} />
            <section className="space-y-6">
              {result.log_sheets.map((sheet) => (
                <LogSheet key={sheet.date} logSheet={sheet} />
              ))}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
