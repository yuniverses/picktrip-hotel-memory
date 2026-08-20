import { describe, expect, it } from "vitest";
import { personalizeCandidates } from "@/src/domain/personalization";

const hotels = Array.from({ length: 8 }, (_, index) => ({
  hotelId: `hotel-${index}`,
  name: `Hotel ${index}`,
  nameEn: `Hotel ${index}`,
  starRating: 5,
  ratingScore: 9,
  reviewCount: 1,
  categoryName: "Hotel",
  primaryImage: "",
  latitude: 35.68 + index * 0.001,
  longitude: 139.76 + index * 0.001,
  address: "Tokyo",
  cityName: "Tokyo",
  countryCode: "JP",
  countryName: "Japan",
  destinationName: "Tokyo",
  highlights: [],
  minPriceCache: null,
  siteId: "",
}));

describe("hotel map personalization", () => {
  it("reserves visible POIs for each recalled place preference alongside hotels", () => {
    const result = personalizeCandidates({
      hotels,
      preferences: [
        { id: "pref-cafe", statement: "Nearby cafes", category: "cafe", confidence: 1, score: 1 },
        {
          id: "pref-transit",
          statement: "Easy trains",
          category: "transit",
          confidence: 1,
          score: 1,
        },
      ],
      pois: [
        ...Array.from({ length: 8 }, (_, index) => ({
          placeId: `attraction-${index}`,
          title: `Attraction ${index}`,
          latitude: 35.67 + index * 0.001,
          longitude: 139.75 + index * 0.001,
          primaryType: "museum",
          tags: [] as string[],
        })),
        {
          placeId: "cafe-1",
          title: "Coffee One",
          latitude: 35.68,
          longitude: 139.76,
          primaryType: "coffee_shop",
          tags: [],
        },
        {
          placeId: "station-1",
          title: "Station One",
          latitude: 35.69,
          longitude: 139.77,
          primaryType: "train_station",
          tags: [],
        },
      ],
    });

    expect(result.pins.filter((pin) => pin.kind === "hotel")).toHaveLength(4);
    expect(result.pins.filter((pin) => pin.kind === "cafe")).toHaveLength(1);
    expect(result.pins.filter((pin) => pin.kind === "transit")).toHaveLength(1);
    expect(result.pins.map((pin) => pin.id)).toContain("cafe:cafe-1");
    expect(result.pins.map((pin) => pin.id)).toContain("transit:station-1");
    expect(result.pins).toHaveLength(8);
  });
});
