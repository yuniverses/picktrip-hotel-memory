import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  append: vi.fn(),
  remember: vi.fn(),
  recall: vi.fn(),
  searchPlaces: vi.fn(),
}));

vi.mock("@/src/mastra/agents/hotel-memory-agent", () => ({
  hotelMemoryAgent: { generate: mocks.generate },
}));
vi.mock("@/src/lib/elastic/client", () => ({ getElasticClient: () => ({}) }));
vi.mock("@/src/lib/elastic/conversation-store", () => ({
  ElasticConversationStore: class {
    append = mocks.append;
  },
}));
vi.mock("@/src/lib/elastic/preference-store", () => ({
  ElasticPreferenceStore: class {
    remember = mocks.remember;
    recall = mocks.recall;
  },
}));
vi.mock("@/src/lib/picktrip/place-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/src/lib/picktrip/place-client")>();
  return { ...original, searchPicktripPlaces: mocks.searchPlaces };
});

import { generateHotelTurn } from "@/src/mastra/generate-hotel-turn";

const preferences = [
  {
    id: "pref-cafe",
    statement: "I always look for nearby cafes",
    category: "cafe" as const,
    confidence: 0.92,
    score: 1,
  },
  {
    id: "pref-transit",
    statement: "I require easy train access",
    category: "transit" as const,
    confidence: 0.92,
    score: 1,
  },
];

const hotel = {
  hotelId: "hotel-1",
  name: "Grounded Hotel",
  nameEn: "Grounded Hotel",
  starRating: 4,
  ratingScore: 8.8,
  reviewCount: 100,
  categoryName: "Hotel",
  primaryImage: "",
  latitude: 35.68,
  longitude: 139.76,
  address: "Tokyo",
  cityName: "Tokyo",
  countryCode: "JP",
  countryName: "Japan",
  destinationName: "Tokyo",
  highlights: [],
  minPriceCache: null,
  siteId: "picktrip",
};

describe("generateHotelTurn deterministic POI fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generate.mockResolvedValue({ text: "I used your recalled travel preferences." });
    mocks.append.mockResolvedValue("event-1");
    mocks.remember.mockResolvedValue("preference-1");
    mocks.recall.mockResolvedValue(preferences);
    mocks.searchPlaces.mockImplementation(async ({ query }: { query: string }) => [
      query.includes("coffee")
        ? {
            placeId: "cafe-1",
            title: "Grounded Coffee",
            latitude: 35.681,
            longitude: 139.761,
            primaryType: "point_of_interest",
            tags: [],
          }
        : {
            placeId: "station-1",
            title: "Grounded Station",
            latitude: 35.682,
            longitude: 139.762,
            primaryType: "point_of_interest",
            tags: [],
          },
    ]);
  });

  it("fetches and adds both cafe and transit pins when the model omits the map tool", async () => {
    const result = await generateHotelTurn({
      resourceId: "user-1",
      credential: "picktrip-token",
      threadId: "thread-1",
      message: "I always look for nearby cafes and require easy train access.",
      searchContext: { destination: "Tokyo", hotels: [hotel], pois: [] },
    });

    const pins = result.pinOperations.flatMap((operation) =>
      operation.operation === "upsert" ? operation.pins : [],
    );
    expect(pins.map((pin) => pin.kind)).toEqual(
      expect.arrayContaining(["hotel", "cafe", "transit"]),
    );
    expect(mocks.searchPlaces).toHaveBeenCalledTimes(2);
    expect(mocks.searchPlaces).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "coffee shops",
        contextDestination: "Tokyo",
        languageCode: "en",
      }),
      "picktrip-token",
    );
    expect(mocks.searchPlaces).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "train stations and public transit",
        contextDestination: "Tokyo",
        languageCode: "en",
      }),
      "picktrip-token",
    );
  });

  it("keeps a why follow-up free of new pins and does not refetch POIs", async () => {
    mocks.generate.mockResolvedValue({
      text: "I chose Grounded Hotel because it matches your transit access and café preferences.",
    });

    const result = await generateHotelTurn({
      resourceId: "user-1",
      credential: "picktrip-token",
      threadId: "thread-1",
      message: "Why did you choose this hotel?",
      searchContext: { destination: "Tokyo", hotels: [hotel], pois: [] },
    });

    expect(result.pinOperations).toEqual([]);
    expect(mocks.searchPlaces).not.toHaveBeenCalled();
    expect(result.assistantText).toContain("I chose Grounded Hotel");
  });
});
