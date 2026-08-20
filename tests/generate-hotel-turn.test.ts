import { describe, expect, it } from "vitest";
import { hotelMemoryAgentInstructions } from "@/src/mastra/agents/hotel-memory-agent";
import { groundAssistantText, shouldPersonalizeHotelMap } from "@/src/mastra/generate-hotel-turn";

const hotelPin = {
  id: "hotel:tokyo-1",
  entityId: "tokyo-1",
  kind: "hotel" as const,
  title: "Tokyo Station Hotel",
  latitude: 35.6812,
  longitude: 139.7671,
  reason: "符合你的交通偏好",
  preferenceIds: ["pref-1"],
  score: 0.95,
  source: "picktrip-hotel-api" as const,
};

describe("groundAssistantText", () => {
  it("replaces contradictory model text with grounded pin confirmation", () => {
    const text = groundAssistantText({
      modelText: "地圖圖片目前無法使用，請告訴我目的地。我推薦 Imaginary Hotel。",
      destination: "Tokyo",
      pinOperations: [{ operation: "upsert", pins: [hotelPin] }],
      recalledPreferences: [
        {
          id: "pref-1",
          statement: "靠近車站",
          category: "transit",
          confidence: 1,
          score: 1,
        },
      ],
    });

    expect(text).toContain("Added 1 personalized pin to the map for Tokyo");
    expect(text).toContain("Tokyo Station Hotel");
    expect(text).toContain("transit access");
    expect(text).not.toMatch(/無法|請告訴我目的地|Imaginary Hotel/);
  });

  it("does not ask for a destination already supplied by request context", () => {
    const text = groundAssistantText({
      modelText: "請先告訴我目的地。",
      destination: "Tokyo",
      pinOperations: [],
      recalledPreferences: [],
    });

    expect(text).toBe(
      "The current destination is Tokyo. I did not add any new recommendation pins in this turn.",
    );
  });

  it("reports an explicit tool failure in English", () => {
    const text = groundAssistantText({
      modelText: "地圖更新失敗，請稍後再試。",
      destination: "Tokyo",
      pinOperations: [],
      recalledPreferences: [],
      explicitToolError: true,
    });

    expect(text).toBe(
      "I could not update the map for Tokyo because the personalization tool returned an error. Please try again.",
    );
  });

  it("never returns Chinese model prose when there are no pins", () => {
    const text = groundAssistantText({
      modelText: "我記得你喜歡咖啡廳，下次會優先推薦。",
      destination: "Tokyo",
      pinOperations: [],
      recalledPreferences: [
        {
          id: "pref-2",
          statement: "喜歡咖啡廳",
          category: "cafe",
          confidence: 1,
          score: 1,
        },
      ],
    });

    expect(text).toBe(
      "The current destination is Tokyo. I did not add any new recommendation pins in this turn. Recalled preferences considered: cafés nearby.",
    );
  });

  it("preserves safe English conversational text when it makes no ungrounded claim", () => {
    const text = groundAssistantText({
      modelText: "You're welcome. I will keep your transit preference in mind.",
      destination: "Tokyo",
      pinOperations: [],
      recalledPreferences: [],
    });

    expect(text).toBe("You're welcome. I will keep your transit preference in mind.");
  });

  it("answers an exact second-turn why follow-up instead of repeating the pin summary", () => {
    const modelText =
      "I chose Tokyo Station Hotel because it best matches your recalled preference for transit access.";
    const text = groundAssistantText({
      userMessage: "why you choose this hotel",
      modelText,
      destination: "Tokyo",
      pinOperations: [{ operation: "upsert", pins: [hotelPin] }],
      recalledPreferences: [
        {
          id: "pref-1",
          statement: "靠近車站",
          category: "transit",
          confidence: 1,
          score: 1,
        },
      ],
      groundedHotelNames: ["Tokyo Station Hotel"],
    });

    expect(text).toBe(modelText);
    expect(text).not.toContain("Added 1 personalized pin");
  });

  it("answers a Chinese why follow-up in English with grounded hotel and preference data", () => {
    const modelText =
      "I chose Tokyo Station Hotel because it aligns with your preference for transit access.";
    const text = groundAssistantText({
      userMessage: "為什麼選這間飯店？",
      modelText,
      destination: "Tokyo",
      pinOperations: [{ operation: "upsert", pins: [hotelPin] }],
      recalledPreferences: [
        {
          id: "pref-1",
          statement: "靠近車站",
          category: "transit",
          confidence: 1,
          score: 1,
        },
      ],
      groundedHotelNames: ["Tokyo Station Hotel"],
    });

    expect(text).toBe(modelText);
    expect(text).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it("rejects invented facilities in a why answer and returns a grounded English explanation", () => {
    const text = groundAssistantText({
      userMessage: "Why did you choose this hotel?",
      modelText: "I chose Tokyo Station Hotel because it has a pool and free breakfast.",
      destination: "Tokyo",
      pinOperations: [{ operation: "upsert", pins: [hotelPin] }],
      recalledPreferences: [
        {
          id: "pref-1",
          statement: "靠近車站",
          category: "transit",
          confidence: 1,
          score: 1,
        },
      ],
      groundedHotelNames: ["Tokyo Station Hotel"],
    });

    expect(text).toBe(
      "I chose Tokyo Station Hotel because it best matches your recalled preference for transit access.",
    );
    expect(text).not.toMatch(/pool|breakfast/i);
  });

  it("rejects an ungrounded hotel name when no hotel pins were returned", () => {
    const text = groundAssistantText({
      modelText: "I recommend Imaginary Hotel for this stay.",
      destination: "Tokyo",
      pinOperations: [],
      recalledPreferences: [],
    });

    expect(text).toBe(
      "The current destination is Tokyo. I did not add any new recommendation pins in this turn.",
    );
    expect(text).not.toContain("Imaginary Hotel");
  });

  it("instructs the model to answer only in natural English", () => {
    expect(hotelMemoryAgentInstructions).toMatch(/Respond only in concise, natural English/i);
    expect(hotelMemoryAgentInstructions).toMatch(/even if the user writes in another language/i);
    expect(hotelMemoryAgentInstructions).not.toMatch(/Traditional Chinese hotel advisor/i);
  });

  it("updates the map for recommendation turns but not explanatory follow-ups", () => {
    expect(shouldPersonalizeHotelMap("Find hotels near cafés and add them to the map")).toBe(true);
    expect(shouldPersonalizeHotelMap("why you choose this hotel")).toBe(false);
    expect(shouldPersonalizeHotelMap("為什麼選這間飯店？")).toBe(false);
    expect(shouldPersonalizeHotelMap("Compare the recommended hotels")).toBe(false);
    expect(shouldPersonalizeHotelMap("Why this hotel, and add nearby cafés to the map")).toBe(true);
  });
});
