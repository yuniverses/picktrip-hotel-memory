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

const rawPlaceCardSchema = z.object({
  placeId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  subtitle: z.string().nullish(),
  address: z.string().nullish(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  primaryType: z.string().nullish(),
  tags: z.array(z.string()).optional(),
});

function normalizePlaceCards(payload: unknown): PoiCandidate[] {
  const cards = z
    .object({ data: z.object({ cards: z.array(z.unknown()).optional() }).optional() })
    .passthrough()
    .safeParse(payload);
  if (!cards.success) return [];
  return (cards.data.data?.cards ?? []).flatMap((raw) => {
    const parsed = rawPlaceCardSchema.safeParse(raw);
    if (!parsed.success) return [];
    return [
      poiCandidateSchema.parse({
        ...parsed.data,
        primaryType: parsed.data.primaryType ?? "other",
        tags: parsed.data.tags ?? [],
        imageUrl: null,
      }),
    ];
  });
}

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
  return normalizePlaceCards(payload);
}

export function withRequestedPoiKind(
  pois: PoiCandidate[],
  kind: "cafe" | "transit" | "attraction",
): PoiCandidate[] {
  return pois.map((poi) => ({
    ...poi,
    tags: [...new Set([...poi.tags, kind])],
  }));
}
