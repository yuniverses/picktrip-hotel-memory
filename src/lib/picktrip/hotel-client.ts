import { z } from "zod";
import { getPicktripApiUrl } from "./config";
import { normalizeHotelSearchResponse } from "./hotel-adapter";

export const hotelSearchRequestSchema = z
  .object({
    q: z.string().trim().min(1).optional(),
    countryCode: z.string().trim().min(2).optional(),
    cityName: z.string().trim().min(1).optional(),
    hitsPerPage: z.number().int().min(1).max(50).default(30),
    page: z.number().int().nonnegative().default(0),
    currency: z.string().length(3).default("TWD"),
    geo: z
      .object({ lat: z.number(), lng: z.number(), radiusKm: z.number().positive().optional() })
      .optional(),
    starRating: z.number().int().min(1).max(5).optional(),
    facilities: z.array(z.string()).optional(),
    minPrice: z.number().nonnegative().optional(),
    maxPrice: z.number().nonnegative().optional(),
  })
  .refine((input) => Boolean(input.q || input.cityName || input.countryCode || input.geo), {
    message: "A destination is required",
  });

export async function searchPicktripHotels(input: unknown, token: string) {
  const body = hotelSearchRequestSchema.parse(input);
  const response = await fetch(`${getPicktripApiUrl()}/app/shopping/hotel/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new PicktripApiError(response.status, payload);
  const data = payload && typeof payload === "object" && "data" in payload ? payload.data : payload;
  return normalizeHotelSearchResponse(data);
}

export class PicktripApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: unknown,
  ) {
    super(`Picktrip API returned ${status}`);
  }
}
