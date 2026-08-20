import { RequestContext } from "@mastra/core/request-context";
import { personalizeCandidates } from "@/src/domain/personalization";
import { extractExplicitPreferences } from "@/src/domain/preference-extraction";
import type { HotelChatRequest, HotelChatResponse } from "@/src/domain/schemas";
import { getElasticClient } from "@/src/lib/elastic/client";
import { ElasticConversationStore } from "@/src/lib/elastic/conversation-store";
import { ElasticPreferenceStore } from "@/src/lib/elastic/preference-store";
import { hotelMemoryAgent } from "./agents/hotel-memory-agent";
import type { HotelAgentContext } from "./context";
import { personalizeHotelMapOutputSchema } from "./tools/hotel-map-tools";

export async function generateHotelTurn(
  input: HotelChatRequest & { resourceId: string; credential?: string },
): Promise<Omit<HotelChatResponse, "threadId">> {
  if (!input.credential) throw new Error("Authenticated Picktrip credential is required");
  const elastic = getElasticClient();
  const preferences = new ElasticPreferenceStore(elastic);
  const conversations = new ElasticConversationStore(elastic);
  const explicit = extractExplicitPreferences(input.message, input.searchContext.destination);
  await Promise.all(
    explicit.map((preference) =>
      preferences.remember({
        ...preference,
        resourceId: input.resourceId,
        threadId: input.threadId,
      }),
    ),
  );
  await conversations.append({
    resourceId: input.resourceId,
    threadId: input.threadId,
    role: "user",
    message: input.message,
    destination: input.searchContext.destination,
  });

  const requestContext = new RequestContext<HotelAgentContext>();
  requestContext.set("resourceId", input.resourceId);
  requestContext.set("threadId", input.threadId);
  requestContext.set("picktripToken", input.credential);
  requestContext.set("destination", input.searchContext.destination);
  requestContext.set("hotels", input.searchContext.hotels);
  requestContext.set("pois", input.searchContext.pois);
  if (input.searchContext.viewport) requestContext.set("viewport", input.searchContext.viewport);

  const pinOperations: HotelChatResponse["pinOperations"] = [];
  const recommendationReasons: HotelChatResponse["recommendationReasons"] = [];
  let recalledPreferences: HotelChatResponse["recalledPreferences"] = [];
  let personalizationToolFailed = false;
  const result = await hotelMemoryAgent.generate(input.message, {
    memory: { resource: input.resourceId, thread: input.threadId },
    requestContext,
    maxSteps: 8,
    hooks: {
      afterToolCall: ({ toolName, output, error }) => {
        if (toolName === "personalizeHotelMap" && error) personalizationToolFailed = true;
        if (toolName === "personalizeHotelMap" && !error) {
          const parsed = personalizeHotelMapOutputSchema.safeParse(output);
          if (parsed.success) {
            pinOperations.push(...parsed.data.operations);
            recommendationReasons.push(...parsed.data.reasons);
            recalledPreferences = parsed.data.recalledPreferences;
          }
        }
      },
    },
  });

  if (pinOperations.length === 0) {
    recalledPreferences = await preferences.recall({
      resourceId: input.resourceId,
      searchText: input.message,
      destination: input.searchContext.destination,
    });
    const personalized = personalizeCandidates({
      hotels: input.searchContext.hotels,
      pois: input.searchContext.pois,
      preferences: recalledPreferences,
    });
    pinOperations.push({ operation: "upsert", pins: personalized.pins });
    recommendationReasons.push(...personalized.reasons);
  }

  const assistantText = groundAssistantText({
    modelText: result.text,
    destination: input.searchContext.destination,
    pinOperations,
    recalledPreferences,
    explicitToolError: personalizationToolFailed,
  });
  await conversations.append({
    resourceId: input.resourceId,
    threadId: input.threadId,
    role: "assistant",
    message: assistantText,
    destination: input.searchContext.destination,
  });
  return { assistantText, pinOperations, recommendationReasons, recalledPreferences };
}

export function groundAssistantText(input: {
  modelText: string;
  destination: string;
  pinOperations: HotelChatResponse["pinOperations"];
  recalledPreferences: HotelChatResponse["recalledPreferences"];
  explicitToolError?: boolean;
}): string {
  const pins = input.pinOperations.flatMap((operation) =>
    operation.operation === "upsert" ? operation.pins : [],
  );
  if (pins.length > 0) {
    const hotelNames = [
      ...new Set(
        pins
          .filter((pin) => pin.kind === "hotel" && pin.source === "picktrip-hotel-api")
          .map((pin) => pin.title),
      ),
    ].slice(0, 4);
    const preferences = summarizePreferenceCategories(input.recalledPreferences);
    return [
      `Added ${pins.length} personalized ${pins.length === 1 ? "pin" : "pins"} to the map for ${input.destination}.`,
      hotelNames.length ? `Recommended hotels: ${hotelNames.join(", ")}.` : "",
      preferences.length ? `Recalled preferences used: ${preferences.join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (input.explicitToolError) {
    return `I could not update the map for ${input.destination} because the personalization tool returned an error. Please try again.`;
  }

  const modelText = input.modelText.trim();
  if (isSafeEnglishConversation(modelText)) return modelText;

  const preferences = summarizePreferenceCategories(input.recalledPreferences);
  return [
    `The current destination is ${input.destination}. I did not add any new recommendation pins in this turn.`,
    preferences.length ? `Recalled preferences considered: ${preferences.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function isSafeEnglishConversation(modelText: string): boolean {
  if (!modelText || /[\u3400-\u9fff]/u.test(modelText)) return false;

  const asksForKnownDestination =
    /(?:tell|give|provide|choose|select).{0,24}(?:destination|city)|(?:what|where).{0,16}(?:destination|city)/i.test(
      modelText,
    );
  const claimsMapFailure =
    /(?:map|image|pin).{0,24}(?:unavailable|failed|failure|cannot|can't|unable)|(?:cannot|can't|unable).{0,24}(?:map|image|pin)/i.test(
      modelText,
    );
  const discussesUngroundedPlace =
    /\b(?:hotel|inn|resort|hostel|lodge|cafe|café|coffee shop|restaurant|station|attraction)\b/i.test(
      modelText,
    );
  const inventsTravelFact =
    /(?:[$€£¥]|\b(?:USD|EUR|GBP|JPY|TWD|NT\$)\b|\b\d+(?:\.\d+)?\s*(?:km|kilometers?|miles?|minutes?)\b|\b(?:available|availability|sold out)\b)/i.test(
      modelText,
    );

  return !(
    asksForKnownDestination ||
    claimsMapFailure ||
    discussesUngroundedPlace ||
    inventsTravelFact
  );
}

const preferenceCategoryLabels: Record<
  HotelChatResponse["recalledPreferences"][number]["category"],
  string
> = {
  transit: "transit access",
  cafe: "cafés nearby",
  food: "dining options",
  budget: "price and budget",
  room: "room preferences",
  neighborhood: "neighborhood fit",
  avoid: "places to avoid",
};

function summarizePreferenceCategories(
  preferences: HotelChatResponse["recalledPreferences"],
): string[] {
  return [...new Set(preferences.map((item) => preferenceCategoryLabels[item.category]))].slice(
    0,
    3,
  );
}
