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
}: TripInputFormProps) {
  const {
    register,
    setValue,
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

  return (
    <div className="rounded-xl bg-white p-6 shadow-lg">
      <h2 className="mb-4 text-xl font-semibold text-gray-900">Trip Inputs</h2>
      <form className="space-y-4" onSubmit={handleSubmit((data) => onSubmit(data))}>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Current Location</label>
          <input
            {...register("current_location")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
            placeholder="Chicago, IL"
          />
          {errors.current_location && (
            <p className="mt-1 text-sm text-red-600">{errors.current_location.message}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Pickup Location</label>
          <input
            {...register("pickup_location")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
            placeholder="Dallas, TX"
          />
          {errors.pickup_location && (
            <p className="mt-1 text-sm text-red-600">{errors.pickup_location.message}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Dropoff Location</label>
          <input
            {...register("dropoff_location")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
            placeholder="Los Angeles, CA"
          />
          {errors.dropoff_location && (
            <p className="mt-1 text-sm text-red-600">{errors.dropoff_location.message}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Cycle Hours Used</label>
          <input
            type="number"
            step="0.1"
            min={0}
            max={70}
            {...register("cycle_hours_used", { valueAsNumber: true })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">Hours used in current 8-day cycle (0-70)</p>
          {errors.cycle_hours_used && (
            <p className="mt-1 text-sm text-red-600">{errors.cycle_hours_used.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isLoading ? "Planning..." : "Plan Trip"}
        </button>

        {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
      </form>
    </div>
  );
}
