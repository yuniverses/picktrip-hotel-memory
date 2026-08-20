import { z } from "zod";
import { type HotelCandidate, hotelCandidateSchema } from "@/src/domain/schemas";

const rawHitSchema = z
  .object({
    hotelId: z.string().min(1),
    name: z.string().min(1),
    nameEn: z.string().optional(),
    starRating: z.number().optional(),
    ratingScore: z.number().nullable().optional(),
    reviewCount: z.number().optional(),
    categoryName: z.string().optional(),
    primaryImage: z.string().optional(),
    primaryImageUrl: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    location: z
      .object({
        address: z.string().optional(),
        cityName: z.string().optional(),
        countryCode: z.string().optional(),
        countryName: z.string().optional(),
        destinationName: z.string().optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
      })
      .nullish(),
    address: z.string().optional(),
    cityName: z.string().optional(),
    countryCode: z.string().optional(),
    countryName: z.string().optional(),
    destinationName: z.string().optional(),
    highlights: z.array(z.string()).optional(),
    minPriceCache: z
      .object({ amount: z.number().nonnegative(), currency: z.string().length(3) })
      .nullable()
      .optional(),
    siteId: z.string().nullish(),
  })
  .passthrough();

const rawResponseSchema = z
  .object({
    hits: z.array(z.unknown()),
    totalHits: z.number().optional(),
    page: z.number().optional(),
    totalPages: z.number().optional(),
    hitsPerPage: z.number().optional(),
    query: z.string().optional(),
  })
  .passthrough();

export type HotelSearchResponse = {
  hits: HotelCandidate[];
  totalHits: number;
  page: number;
  totalPages: number;
  hitsPerPage: number;
  query: string;
};

export function normalizeHotelSearchResponse(payload: unknown): HotelSearchResponse {
  const raw = rawResponseSchema.parse(payload);
  const hits = raw.hits.flatMap((value) => {
    const parsedHit = rawHitSchema.safeParse(value);
    if (!parsedHit.success) return [];

    const hit = parsedHit.data;
    const latitude = hit.latitude ?? hit.location?.lat;
    const longitude = hit.longitude ?? hit.location?.lng;
    if (!isValidCoordinatePair(latitude, longitude)) return [];

    const candidate = hotelCandidateSchema.safeParse({
      ...hit,
      primaryImage: hit.primaryImageUrl ?? hit.primaryImage,
      latitude,
      longitude,
      address: hit.address ?? hit.location?.address,
      cityName: hit.cityName ?? hit.location?.cityName,
      countryCode: hit.countryCode ?? hit.location?.countryCode,
      countryName: hit.countryName ?? hit.location?.countryName,
      destinationName: hit.destinationName ?? hit.location?.destinationName,
      siteId: hit.siteId ?? "",
    });
    return candidate.success ? [candidate.data] : [];
  });
  return {
    hits,
    totalHits: raw.totalHits ?? hits.length,
    page: raw.page ?? 0,
    totalPages: raw.totalPages ?? (hits.length ? 1 : 0),
    hitsPerPage: raw.hitsPerPage ?? hits.length,
    query: raw.query ?? "",
  };
}

function isValidCoordinatePair(
  latitude: number | undefined,
  longitude: number | undefined,
): boolean {
  return (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    (latitude !== 0 || longitude !== 0)
  );
}
