import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import axios, { type AxiosError } from "axios";
import { TripInputForm } from "../components/TripInputForm";
import { RouteMap } from "../components/RouteMap";
import { TimelineView } from "../components/TimelineView";
import { LogSheet } from "../components/LogSheet";
import { ThemeToggle } from "../components/ThemeToggle";
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
    <div className="flex h-96 flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <Spinner />
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

function EmptyResults() {
  return (
    <section
      className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-gray-300 bg-white/60 px-6 py-16 text-center dark:border-gray-700 dark:bg-gray-800/40"
      aria-label="No trip planned yet"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.6}
          stroke="currentColor"
          className="h-7 w-7"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 7V3m8 4V3M3.75 9.75h16.5M4.5 6.75h15a.75.75 0 0 1 .75.75v12a.75.75 0 0 1-.75.75h-15a.75.75 0 0 1-.75-.75v-12a.75.75 0 0 1 .75-.75Z"
          />
        </svg>
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          No trip planned yet
        </h3>
        <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
          Enter your trip details and click{" "}
          <span className="font-medium text-gray-700 dark:text-gray-200">Plan Trip</span> to
          generate your ELD logs.
        </p>
      </div>
    </section>
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
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-gray-900 transition-colors sm:px-6 lg:px-8 dark:bg-slate-900 dark:text-gray-100">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  className="h-6 w-6"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5V7.5a1.5 1.5 0 0 1 1.5-1.5H14v10.5M14 16.5V9.75h3.75L21 13.5v3M14 16.5h6.25M3 16.5h2.25"
                  />
                  <circle cx="7.25" cy="17.25" r="1.5" />
                  <circle cx="17.25" cy="17.25" r="1.5" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl dark:text-gray-100">
                  Spotter ELD
                </h1>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  FMCSA-compliant trip planner for property-carrying drivers.
                </p>
              </div>
            </div>
            <ThemeToggle />
          </div>
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
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Trip Results
                </h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Review the timeline and FMCSA daily log sheets below.
                </p>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:hover:border-blue-400 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.2}
                  stroke="currentColor"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Plan New Trip
              </button>
            </div>
            <TimelineView logSheets={result.log_sheets} />
            <section className="space-y-6">
              {result.log_sheets.map((sheet) => (
                <LogSheet key={sheet.date} logSheet={sheet} />
              ))}
            </section>
          </>
        ) : (
          <EmptyResults />
        )}
      </div>
    </main>
  );
}
