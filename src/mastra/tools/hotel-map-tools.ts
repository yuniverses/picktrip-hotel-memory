import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { personalizeCandidates } from "@/src/domain/personalization";
import {
  hotelCandidateSchema,
  mapPinSchema,
  poiCandidateSchema,
  recalledPreferenceSchema,
  recommendationReasonSchema,
} from "@/src/domain/schemas";
import { getElasticClient } from "@/src/lib/elastic/client";
import { ElasticPreferenceStore } from "@/src/lib/elastic/preference-store";
import { searchPicktripPlaces } from "@/src/lib/picktrip/place-client";
import { hotelAgentContextSchema, requireValue } from "../context";

export const personalizeHotelMapOutputSchema = z.object({
  operations: z.array(z.object({ operation: z.literal("upsert"), pins: z.array(mapPinSchema) })),
  reasons: z.array(recommendationReasonSchema),
  recalledPreferences: z.array(recalledPreferenceSchema),
});

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
    const queries = [
      preferences.some((item) => item.category === "cafe") ? "咖啡廳" : null,
      preferences.some((item) => item.category === "transit") ? "車站 交通" : null,
    ].filter((value): value is string => Boolean(value));
    const fetched = (
      await Promise.all(
        queries.map((placeQuery) =>
          searchPicktripPlaces(
            { query: placeQuery, contextDestination: destination, limit: 4, languageCode: "zh-TW" },
            token,
          ),
        ),
      )
    ).flat();
    const byId = new Map([...currentPois, ...fetched].map((poi) => [poi.placeId, poi]));
    const personalized = personalizeCandidates({
      hotels,
      pois: [...byId.values()],
      preferences,
    });
    return {
      operations: [{ operation: "upsert" as const, pins: personalized.pins }],
      reasons: personalized.reasons,
      recalledPreferences: preferences,
    };
  },
});
