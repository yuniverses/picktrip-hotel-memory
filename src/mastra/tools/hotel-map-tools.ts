import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { personalizeCandidates } from "@/src/domain/personalization";
import {
  hotelCandidateSchema,
  mapPinSchema,
  type PoiCandidate,
  poiCandidateSchema,
  type RecalledPreference,
  recalledPreferenceSchema,
  recommendationReasonSchema,
} from "@/src/domain/schemas";
import { getElasticClient } from "@/src/lib/elastic/client";
import { ElasticPreferenceStore } from "@/src/lib/elastic/preference-store";
import { searchPicktripPlaces, withRequestedPoiKind } from "@/src/lib/picktrip/place-client";
import { hotelAgentContextSchema, requireValue } from "../context";

export const personalizeHotelMapOutputSchema = z.object({
  operations: z.array(z.object({ operation: z.literal("upsert"), pins: z.array(mapPinSchema) })),
  reasons: z.array(recommendationReasonSchema),
  recalledPreferences: z.array(recalledPreferenceSchema),
});

type RequestedPoiKind = "cafe" | "transit";

const preferencePoiQueries: Record<RequestedPoiKind, string> = {
  cafe: "coffee shops",
  transit: "train stations and public transit",
};

export async function fetchAuthoritativePreferencePois(input: {
  preferences: RecalledPreference[];
  currentPois: PoiCandidate[];
  destination: string;
  token: string;
}): Promise<PoiCandidate[]> {
  const requestedKinds = (["cafe", "transit"] as const).filter((kind) =>
    input.preferences.some((preference) => preference.category === kind),
  );
  const fetched = (
    await Promise.all(
      requestedKinds.map(async (kind) =>
        withRequestedPoiKind(
          await searchPicktripPlaces(
            {
              query: preferencePoiQueries[kind],
              contextDestination: input.destination,
              limit: 4,
              languageCode: "en",
            },
            input.token,
          ),
          kind,
        ),
      ),
    )
  ).flat();
  return [...new Map([...input.currentPois, ...fetched].map((poi) => [poi.placeId, poi])).values()];
}

export const personalizeHotelMap = createTool({
  id: "personalize-hotel-map",
  description:
    "Recall preferences, fetch authoritative Picktrip POIs, and deterministically personalize current hotel/map candidates.",
  inputSchema: z.object({ query: z.string().min(1) }),
  outputSchema: personalizeHotelMapOutputSchema,
  requestContextSchema: hotelAgentContextSchema,
  execute: async ({ query }, execution) => {
    const resourceId = requireValue(execution.requestContext?.get("resourceId"), "resourceId");
    const destination = requireValue(execution.requestContext?.get("destination"), "destination");
    const token = requireValue(execution.requestContext?.get("picktripToken"), "picktripToken");
    const hotels = z
      .array(hotelCandidateSchema)
      .parse(requireValue(execution.requestContext?.get("hotels"), "hotels"));
    const currentPois = z
      .array(poiCandidateSchema)
      .parse(requireValue(execution.requestContext?.get("pois"), "pois"));
    const preferences = await new ElasticPreferenceStore(getElasticClient()).recall({
      resourceId,
      searchText: query,
      destination,
    });
    const pois = await fetchAuthoritativePreferencePois({
      preferences,
      currentPois,
      destination,
      token,
    });
    const personalized = personalizeCandidates({
      hotels,
      pois,
      preferences,
    });
    return {
      operations: [{ operation: "upsert" as const, pins: personalized.pins }],
      reasons: personalized.reasons,
      recalledPreferences: preferences,
    };
  },
});
