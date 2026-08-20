import { describe, expect, it } from "vitest";
import { normalizeHotelSearchResponse } from "@/src/lib/picktrip/hotel-adapter";

describe("Picktrip hotel adapter", () => {
  it("normalizes nested Picktrip location lat/lng coordinates", () => {
    const result = normalizeHotelSearchResponse({
      hits: [
        {
          hotelId: "abc",
          name: "東京車站飯店",
          nameEn: "Tokyo Station Hotel",
          starRating: 5,
          ratingScore: 9.2,
          reviewCount: 2200,
          categoryName: "Hotel",
          primaryImage: "https://images.example/hotel.jpg",
          location: {
            lat: 35.6812,
            lng: 139.7671,
            address: "Marunouchi",
            cityName: "Tokyo",
            countryCode: "JP",
            countryName: "Japan",
            destinationName: "Tokyo",
          },
          highlights: ["Station"],
          minPriceCache: { amount: 24349, currency: "TWD" },
          siteId: "site-1",
        },
      ],
      totalHits: 1,
      page: 0,
      totalPages: 1,
      hitsPerPage: 15,
      query: "Tokyo",
    });

    expect(result.hits[0]).toMatchObject({
      hotelId: "abc",
      latitude: 35.6812,
      longitude: 139.7671,
      address: "Marunouchi",
      cityName: "Tokyo",
      minPriceCache: { amount: 24349, currency: "TWD" },
    });
  });

  it("accepts flat coordinates and normalizes nullable siteId", () => {
    const result = normalizeHotelSearchResponse({
      hits: [
        {
          hotelId: "flat-1",
          name: "Flat Coordinate Hotel",
          latitude: 25.0478,
          longitude: 121.5319,
          siteId: null,
        },
      ],
    });

    expect(result.hits[0]).toMatchObject({
      hotelId: "flat-1",
      latitude: 25.0478,
      longitude: 121.5319,
      siteId: "",
    });
  });

  it("skips hits without valid coordinates instead of inventing them", () => {
    const result = normalizeHotelSearchResponse({
      hits: [
        { hotelId: "missing-location", name: "No Coordinate Hotel", siteId: null },
        {
          hotelId: "valid-location",
          name: "Valid Hotel",
          location: { lat: 35.6812, lng: 139.7671 },
        },
      ],
      totalHits: 2,
    });

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.hotelId).toBe("valid-location");
    expect(result.totalHits).toBe(2);
  });
});
