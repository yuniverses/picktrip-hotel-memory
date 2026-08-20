import { z } from "zod";
import {
  type HotelCandidate,
  hotelCandidateSchema,
  type PoiCandidate,
  poiCandidateSchema,
} from "@/src/domain/schemas";

export type HotelAgentContext = {
  resourceId: string;
  threadId: string;
  picktripToken: string;
  destination: string;
  hotels: HotelCandidate[];
  pois: PoiCandidate[];
  viewport?: { north: number; south: number; east: number; west: number };
};

export const hotelAgentContextSchema = z.object({
  resourceId: z.string(),
  threadId: z.string(),
  picktripToken: z.string(),
  destination: z.string(),
  hotels: z.array(hotelCandidateSchema),
  pois: z.array(poiCandidateSchema),
  viewport: z
    .object({ north: z.number(), south: z.number(), east: z.number(), west: z.number() })
    .optional(),
});

export function requireValue<T>(value: T, key: string): NonNullable<T> {
  if (value === undefined || value === null || value === "") {
    throw new Error(`Trusted request context value ${key} is missing`);
  }
  return value as NonNullable<T>;
}
