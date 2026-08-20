import { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";
import { personalizeCandidates } from "@/src/domain/personalization";
import { extractExplicitPreferences } from "@/src/domain/preference-extraction";
import {
  type HotelChatRequest,
  type HotelChatResponse,
  recalledPreferenceSchema,
} from "@/src/domain/schemas";
import { getElasticClient } from "@/src/lib/elastic/client";
import { ElasticConversationStore } from "@/src/lib/elastic/conversation-store";
import { ElasticPreferenceStore } from "@/src/lib/elastic/preference-store";
import { hotelMemoryAgent } from "./agents/hotel-memory-agent";
import type { HotelAgentContext } from "./context";
import {
  fetchAuthoritativePreferencePois,
  personalizeHotelMapOutputSchema,
} from "./tools/hotel-map-tools";

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
  const groundingPinOperations: HotelChatResponse["pinOperations"] = [];
  const recommendationReasons: HotelChatResponse["recommendationReasons"] = [];
  let recalledPreferences: HotelChatResponse["recalledPreferences"] = [];
  let personalizationToolFailed = false;
  const shouldUpdateMap = shouldPersonalizeHotelMap(input.message);
  const result = await hotelMemoryAgent.generate(input.message, {
    memory: { resource: input.resourceId, thread: input.threadId },
    requestContext,
    maxSteps: 8,
    hooks: {
      afterToolCall: ({ toolName, output, error }) => {
        if (toolName === "personalizeHotelMap" && error && shouldUpdateMap) {
          personalizationToolFailed = true;
        }
        if (toolName === "recallPreferences" && !error) {
          const parsed = z
            .object({ preferences: z.array(recalledPreferenceSchema) })
            .safeParse(output);
          if (parsed.success) recalledPreferences = parsed.data.preferences;
        }
        if (toolName === "personalizeHotelMap" && !error) {
          const parsed = personalizeHotelMapOutputSchema.safeParse(output);
          if (parsed.success) {
            groundingPinOperations.push(...parsed.data.operations);
            if (shouldUpdateMap) {
              pinOperations.push(...parsed.data.operations);
              recommendationReasons.push(...parsed.data.reasons);
            }
            recalledPreferences = parsed.data.recalledPreferences;
          }
        }
      },
    },
  });

  if (recalledPreferences.length === 0) {
    recalledPreferences = await preferences.recall({
      resourceId: input.resourceId,
      searchText: input.message,
      destination: input.searchContext.destination,
    });
  }

  if (groundingPinOperations.length === 0) {
    const pois = shouldUpdateMap
      ? await fetchAuthoritativePreferencePois({
          preferences: recalledPreferences,
          currentPois: input.searchContext.pois,
          destination: input.searchContext.destination,
          token: input.credential,
        })
      : input.searchContext.pois;
    const personalized = personalizeCandidates({
      hotels: input.searchContext.hotels,
      pois,
      preferences: recalledPreferences,
    });
    const groundedOperation = { operation: "upsert" as const, pins: personalized.pins };
    groundingPinOperations.push(groundedOperation);
    if (shouldUpdateMap) {
      pinOperations.push(groundedOperation);
      recommendationReasons.push(...personalized.reasons);
    }
  }

  const assistantText = groundAssistantText({
    userMessage: input.message,
    modelText: result.text,
    destination: input.searchContext.destination,
    pinOperations: groundingPinOperations,
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
  userMessage?: string;
  modelText: string;
  destination: string;
  pinOperations: HotelChatResponse["pinOperations"];
  recalledPreferences: HotelChatResponse["recalledPreferences"];
  groundedHotelNames?: string[];
  explicitToolError?: boolean;
}): string {
  const pins = input.pinOperations.flatMap((operation) =>
    operation.operation === "upsert" ? operation.pins : [],
  );
  const isFollowUp = isExplanatoryFollowUp(input.userMessage ?? "");
  if (pins.length > 0 && !isFollowUp) {
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
  const groundedHotelNames = [
    ...new Set([
      ...(input.groundedHotelNames ?? []),
      ...pins
        .filter((pin) => pin.kind === "hotel" && pin.source === "picktrip-hotel-api")
        .map((pin) => pin.title),
    ]),
  ];
  if (isSafeEnglishConversation(modelText, groundedHotelNames)) return modelText;

  const preferences = summarizePreferenceCategories(input.recalledPreferences);
  if (isFollowUp && groundedHotelNames.length > 0) {
    const preferencePhrase = preferences.length
      ? ` because it best matches your recalled ${preferences.length === 1 ? "preference" : "preferences"} for ${joinEnglishList(preferences)}`
      : " because it was the strongest grounded option in the current search";
    return `I chose ${groundedHotelNames[0]}${preferencePhrase}.`;
  }
  return [
    `The current destination is ${input.destination}. I did not add any new recommendation pins in this turn.`,
    preferences.length ? `Recalled preferences considered: ${preferences.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function shouldPersonalizeHotelMap(message: string): boolean {
  const requestsExplicitMapChange =
    /(?:\b(?:add|update|put|place|mark|remove|clear)\b.{0,24}\b(?:map|pins?)\b|\b(?:map|pins?)\b.{0,24}\b(?:add|update|remove|clear)\b|(?:新增|添加|更新|放到|標記|标记|移除|清除).{0,16}(?:地圖|地图|標記|标记))/i.test(
      message,
    );
  if (requestsExplicitMapChange) return true;
  if (isExplanatoryFollowUp(message)) return false;
  return /(?:recommend|suggest|find|search|show|add|update|pin|map|stay|hotel|near|close to|prefer|need|want|care about|推薦|推荐|尋找|找|搜尋|搜索|顯示|显示|新增|添加|標記|标记|地圖|地图|入住|飯店|酒店|附近|偏好|喜歡|喜欢|需要|想要|在意|關心|关心)/i.test(
    message,
  );
}

function isExplanatoryFollowUp(message: string): boolean {
  return /(?:\bwhy\b|\bexplain\b|\bclarif(?:y|ication)\b|\bcompare\b|\btell me more\b|\bwhat do you mean\b|為什麼|为什么|解釋|解释|說明|说明|比較|比较|差別|差异|哪個較好|哪个更好)/i.test(
    message,
  );
}

function isSafeEnglishConversation(modelText: string, groundedHotelNames: string[]): boolean {
  if (!modelText || /[\u3400-\u9fff]/u.test(modelText)) return false;

  const textWithoutGroundedNames = groundedHotelNames.reduce(
    (text, name) => text.replace(new RegExp(escapeRegExp(name), "giu"), ""),
    modelText,
  );

  const asksForKnownDestination =
    /(?:tell|give|provide|choose|select).{0,24}(?:destination|city)|(?:what|where).{0,16}(?:destination|city)/i.test(
      modelText,
    );
  const claimsMapFailure =
    /(?:map|image|pin).{0,24}(?:unavailable|failed|failure|cannot|can't|unable)|(?:cannot|can't|unable).{0,24}(?:map|image|pin)/i.test(
      modelText,
    );
  const discussesUngroundedPlace =
    /\b(?:[A-Z][\w'&.-]*\s+){1,5}(?:Hotel|Inn|Resort|Hostel|Lodge|Cafe|Café|Restaurant|Station)\b/.test(
      textWithoutGroundedNames,
    ) ||
    /\b(?:recommend(?:ed)?|chose|choose|selected)\s+(?:the\s+)?(?:[A-Z][\w'&.-]*(?:\s+[A-Z][\w'&.-]*){0,5})\b/.test(
      textWithoutGroundedNames,
    );
  const inventsTravelFact =
    /(?:[$€£¥]|\b(?:USD|EUR|GBP|JPY|TWD|NT\$)\b|\b\d+(?:\.\d+)?\s*(?:km|kilometers?|miles?|minutes?)\b|\b(?:available|availability|sold out)\b)/i.test(
      modelText,
    );
  const inventsFacility =
    /\b(?:pool|gym|fitness center|spa|breakfast|wi-?fi|parking|airport shuttle|room service|laundry|air conditioning|amenit(?:y|ies))\b/i.test(
      modelText,
    );

  return !(
    asksForKnownDestination ||
    claimsMapFailure ||
    discussesUngroundedPlace ||
    inventsTravelFact ||
    inventsFacility
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function joinEnglishList(values: string[]): string {
  if (values.length < 2) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
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
