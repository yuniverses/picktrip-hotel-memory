import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST as detailPost } from "@/app/api/hotel/detail/route";
import { POST as pricesPost } from "@/app/api/hotel/lowest-prices/route";

describe("hotel commerce BFF auth and validation", () => {
  it("requires a Picktrip session for price and detail", async () => {
    const priceResponse = await pricesPost(
      new NextRequest("http://localhost/api/hotel/lowest-prices", {
        method: "POST",
        body: JSON.stringify({ hotelIds: ["hotel-1"] }),
      }),
    );
    const detailResponse = await detailPost(
      new NextRequest("http://localhost/api/hotel/detail", {
        method: "POST",
        body: JSON.stringify({ hotelId: "hotel-1" }),
      }),
    );

    expect(priceResponse.status).toBe(401);
    expect(detailResponse.status).toBe(401);
  });

  it("rejects an invalid stay before authentication", async () => {
    const response = await pricesPost(
      new NextRequest("http://localhost/api/hotel/lowest-prices", {
        method: "POST",
        body: JSON.stringify({
          hotelIds: ["hotel-1"],
          checkIn: "2026-09-26",
          checkOut: "2026-09-23",
        }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
