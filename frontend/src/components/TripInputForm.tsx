import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { LocationType, PickedLocation, TripPlanRequest } from "../types/api";

const schema = z.object({
  current_location: z.string().min(1, "Required"),
  pickup_location: z.string().min(1, "Required"),
  dropoff_location: z.string().min(1, "Required"),
  cycle_hours_used: z.number().min(0).max(70),
});

type FormValues = z.infer<typeof schema>;

interface TripInputFormProps {
  onSubmit: (data: TripPlanRequest) => void;
  isLoading: boolean;
  errorMessage?: string;
  pickedLocations?: Partial<Record<LocationType, PickedLocation>>;
  resetKey?: number;
  highlightPlanTrip?: boolean;
  highlightCycleHours?: boolean;
  onCycleHoursInteracted?: () => void;
}

const LOCATION_FIELD: Record<LocationType, keyof FormValues> = {
  current: "current_location",
  pickup: "pickup_location",
  dropoff: "dropoff_location",
};

export function TripInputForm({
  onSubmit,
  isLoading,
  errorMessage,
  pickedLocations,
  resetKey,
  highlightPlanTrip = false,
  highlightCycleHours = false,
  onCycleHoursInteracted,
}: TripInputFormProps) {
  const {
    register,
    setValue,
    reset,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      current_location: "",
      pickup_location: "",
      dropoff_location: "",
      cycle_hours_used: 0,
    },
  });

  // Reset the form when the parent signals a full clear.
  useEffect(() => {
    if (!resetKey) return;
    reset();
  }, [resetKey, reset]);

  // Sync picked-label values from the map into the corresponding text input
  // so map-only flows still satisfy the form's required-string validation.
  useEffect(() => {
    if (!pickedLocations) return;
    (Object.entries(pickedLocations) as Array<[LocationType, PickedLocation | undefined]>)
      .forEach(([type, picked]) => {
        if (picked) {
          setValue(LOCATION_FIELD[type], picked.label, { shouldValidate: true });
        }
      });
  }, [pickedLocations, setValue]);

  const inputClass =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-blue-400 dark:focus:ring-blue-400/30";
  const labelClass =
    "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400";
  const shouldGuidePlanTrip = highlightPlanTrip && !isLoading;
  const shouldGuideCycleHours = highlightCycleHours && !isLoading;
  const cycleHoursField = register("cycle_hours_used", { valueAsNumber: true });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-5 border-b border-gray-100 pb-4 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Trip Inputs</h2>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Enter your locations and current cycle usage to generate ELD logs.
        </p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit((data) => onSubmit(data))}>
        <div>
          <label className={labelClass}>Current Location</label>
          <input
            {...register("current_location")}
            className={inputClass}
            placeholder="Chicago, IL"
          />
          {errors.current_location && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.current_location.message}</p>
          )}
        </div>

        <div>
          <label className={labelClass}>Pickup Location</label>
          <input
            {...register("pickup_location")}
            className={inputClass}
            placeholder="Dallas, TX"
          />
          {errors.pickup_location && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.pickup_location.message}</p>
          )}
        </div>

        <div>
          <label className={labelClass}>Dropoff Location</label>
          <input
            {...register("dropoff_location")}
            className={inputClass}
            placeholder="Los Angeles, CA"
          />
          {errors.dropoff_location && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.dropoff_location.message}</p>
          )}
        </div>

        <div
          className={
            shouldGuideCycleHours
              ? "animate-pulse rounded-lg ring-2 ring-blue-400/80 ring-offset-2 ring-offset-white dark:ring-blue-500/70 dark:ring-offset-gray-800"
              : ""
          }
        >
          <label className={labelClass}>Cycle Hours Used</label>
          <input
            type="number"
            step="0.1"
            min={0}
            max={70}
            {...cycleHoursField}
            onFocus={() => onCycleHoursInteracted?.()}
            onChange={(event) => {
              cycleHoursField.onChange(event);
              onCycleHoursInteracted?.();
            }}
            className={inputClass}
          />
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            Hours used in current 8-day cycle (0–70)
          </p>
          {errors.cycle_hours_used && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.cycle_hours_used.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className={`group flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-blue-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:shadow-sm dark:bg-blue-500 dark:hover:bg-blue-600 dark:focus:ring-offset-gray-800 ${
            shouldGuidePlanTrip
              ? "animate-pulse ring-4 ring-blue-300/70 ring-offset-2 ring-offset-white dark:ring-blue-500/40 dark:ring-offset-gray-800"
              : ""
          }`}
        >
          {isLoading ? (
            <>
              <svg
                className="h-4 w-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Planning…
            </>
          ) : (
            <>
              Plan Trip
              <svg
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7-7 7M5 12h16" />
              </svg>
            </>
          )}
        </button>

        {errorMessage ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
            {errorMessage}
          </p>
        ) : null}
      </form>
    </div>
  );
}
