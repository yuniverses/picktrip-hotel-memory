import { describe, expect, it, vi } from "vitest";
import {
  fetchHotelDetail,
  fetchHotelLowestPrices,
  mergeHotelPrices,
} from "@/src/lib/picktrip/hotel-commerce";

const hotel = {
  hotelId: "hotel-1",
  name: "PickTrip Hotel",
  nameEn: "",
  starRating: 4,
  ratingScore: 8.8,
  reviewCount: 20,
  categoryName: "Hotel",
  primaryImage: "",
  latitude: 35.68,
  longitude: 139.76,
  address: "Tokyo",
  cityName: "Tokyo",
  countryCode: "JP",
  countryName: "Japan",
  destinationName: "Tokyo",
  highlights: ["Near station"],
  minPriceCache: null,
  siteId: "",
};

describe("Picktrip hotel commerce adapters", () => {
  it("forwards exact stay/party and normalizes partial true stay totals", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        data: {
          prices: [
            {
              hotelId: "hotel-1",
              displayPriceFrom: 9000,
              displayPricePerNightFrom: 3000,
              displayStayTotalFrom: 9000,
              priceBasis: "STAY_TOTAL",
              displayCurrency: "TWD",
              displayFractionDigits: 0,
            },
            { hotelId: "hotel-2", displayStayTotalFrom: null, displayCurrency: "TWD" },
          ],
        },
      }),
    );

    const prices = await fetchHotelLowestPrices(
      {
        hotelIds: ["hotel-1", "hotel-2"],
        checkIn: "2026-09-23",
        checkOut: "2026-09-26",
        currency: "TWD",
        adults: 2,
        children: 0,
        rooms: 1,
      },
      "session-token",
      fetcher,
      "https://api.example.test",
    );

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.example.test/app/shopping/hotel/lowest-prices",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer session-token" }),
      }),
    );
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      checkIn: "2026-09-23",
      checkOut: "2026-09-26",
      adults: 2,
      children: 0,
      rooms: 1,
    });
    expect(prices[0]).toMatchObject({ hotelId: "hotel-1", displayStayTotalFrom: 9000 });
    expect(prices[1]).toMatchObject({ hotelId: "hotel-2", displayStayTotalFrom: null });
  });

  it("merges only positive stay totals and preserves unavailable rows", () => {
    const merged = mergeHotelPrices(
      [hotel, { ...hotel, hotelId: "hotel-2" }],
      [
        {
          hotelId: "hotel-1",
          displayPriceFrom: 1000,
          displayPricePerNightFrom: 1000,
          displayStayTotalFrom: 3000,
          priceBasis: "STAY_TOTAL",
          displayCurrency: "TWD",
          fractionDigits: 2,
          displayFractionDigits: 0,
        },
        {
          hotelId: "hotel-2",
          displayPriceFrom: 1000,
          displayPricePerNightFrom: null,
          displayStayTotalFrom: null,
          priceBasis: null,
          displayCurrency: "TWD",
          fractionDigits: 2,
          displayFractionDigits: 0,
        },
      ],
    );

    expect(merged[0]).toMatchObject({
      priceStatus: "ready",
      stayPrice: { displayStayTotalFrom: 3000 },
    });
    expect(merged[1]).toMatchObject({ priceStatus: "unavailable", stayPrice: null });
  });

  it("normalizes authoritative hotel detail without inventing fields", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        data: {
          siteId: "site-1",
          hotelBaseInfo: {
            id: "hotel-1",
            name: "PickTrip Hotel",
            address: "Tokyo",
            star: 4,
            introduction: "A quiet city stay.",
            latitude: "35.68",
            longitude: "139.76",
            imageList: ["https://img.example.test/hotel.jpg", "invalid"],
            facilities: ["Wi-Fi", { name: "Gym" }],
            highlights: ["Near station"],
          },
        },
      }),
    );

    const detail = await fetchHotelDetail(
      "hotel-1",
      "session-token",
      fetcher,
      "https://api.example.test",
    );

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.example.test/app/shopping/hotel/hotel-1",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer session-token" }),
      }),
    );
    expect(detail).toMatchObject({
      hotelId: "hotel-1",
      introduction: "A quiet city stay.",
      imageList: ["https://img.example.test/hotel.jpg"],
      facilities: ["Wi-Fi", "Gym"],
      highlights: ["Near station"],
    });
  });
});
