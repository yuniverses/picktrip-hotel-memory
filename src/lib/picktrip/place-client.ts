import { z } from "zod";
import { type PoiCandidate, poiCandidateSchema } from "@/src/domain/schemas";
import { getPicktripApiUrl } from "./config";
import { PicktripApiError } from "./hotel-client";

export const placeCardsRequestSchema = z.object({
  query: z.union([z.string().trim().min(1), z.array(z.string().trim().min(1)).min(1)]),
  contextDestination: z.string().trim().min(1),
  limit: z.number().int().min(1).max(20).default(6),
  languageCode: z.string().trim().min(1).default("zh-TW"),
});

export async function searchPicktripPlaces(input: unknown, token: string): Promise<PoiCandidate[]> {
  const body = placeCardsRequestSchema.parse(input);
  const response = await fetch(`${getPicktripApiUrl()}/app/places/cards`, {
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
  const cards = payload?.data?.cards;
  return z
    .array(poiCandidateSchema)
    .parse(cards)
    .map((card) => ({ ...card, imageUrl: null }));
}
