import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { TripInputForm } from "../components/TripInputForm";
import { RouteMap } from "../components/RouteMap";
import { TimelineView } from "../components/TimelineView";
import { LogSheet } from "../components/LogSheet";
import { planTrip } from "../lib/api";
import type { TripPlanRequest, TripPlanResponse } from "../types/api";

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

export function PlannerPage() {
  const [result, setResult] = useState<TripPlanResponse | null>(null);

  const mutation = useMutation({
    mutationFn: planTrip,
    onSuccess: (data) => setResult(data),
  });

  const isLoading = mutation.isPending;

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
            onSubmit={(data: TripPlanRequest) => mutation.mutate(data)}
            isLoading={isLoading}
            errorMessage={mutation.isError ? parseError(mutation.error) : undefined}
          />

          {isLoading ? (
            <LoadingPlaceholder label="Calculating route…" />
          ) : result ? (
            <RouteMap events={result.timeline} />
          ) : (
            <div className="flex h-96 items-center justify-center rounded-xl bg-white shadow-lg">
              <p className="text-gray-500">Route map will render after planning a trip.</p>
            </div>
          )}
        </section>

        {isLoading ? (
          <div className="space-y-6">
            <LoadingPlaceholder label="Building timeline…" />
            <LoadingPlaceholder label="Generating ELD log sheets…" />
          </div>
        ) : result ? (
          <>
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
