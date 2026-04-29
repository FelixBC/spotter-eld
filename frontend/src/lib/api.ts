import axios from "axios";
import type { TripPlanRequest, TripPlanResponse } from "../types/api";

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
});

export async function planTrip(data: TripPlanRequest): Promise<TripPlanResponse> {
  const response = await client.post<TripPlanResponse>("/api/trip/plan/", data);
  return response.data;
}
