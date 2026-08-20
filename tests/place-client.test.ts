import { afterEach, describe, expect, it, vi } from "vitest";
import { searchPicktripPlaces, withRequestedPoiKind } from "@/src/lib/picktrip/place-client";

afterEach(() => vi.unstubAllGlobals());

describe("PickTrip place cards adapter", () => {
  it("keeps grounded cards when sibling cards have null or invalid coordinates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              cards: [
                {
                  placeId: "cafe-grounded",
                  title: "Grounded Coffee",
                  latitude: 35.6812,
                  longitude: 139.7671,
                  primaryType: "cafe",
                  tags: ["coffee_shop"],
                },
                {
                  placeId: "missing-coordinates",
                  title: "Unknown place",
                  latitude: null,
                  longitude: null,
                  primaryType: null,
                  tags: [],
                },
                {
                  placeId: "invalid-latitude",
                  title: "Invalid place",
                  latitude: 181,
                  longitude: 139.7,
                },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(
      searchPicktripPlaces(
        { query: "cafes", contextDestination: "Tokyo", languageCode: "en", limit: 4 },
        "secret-token",
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        placeId: "cafe-grounded",
        title: "Grounded Coffee",
        latitude: 35.6812,
        longitude: 139.7671,
        imageUrl: null,
      }),
    ]);
  });

  it("returns an empty list for a successful response without cards", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      searchPicktripPlaces({ query: "stations", contextDestination: "Tokyo" }, "secret-token"),
    ).resolves.toEqual([]);
  });

  it("retains the grounded query category when provider metadata is generic", () => {
    const [poi] = withRequestedPoiKind(
      [
        {
          placeId: "station-result",
          title: "Tokyo Station",
          latitude: 35.6812,
          longitude: 139.7671,
          primaryType: "point_of_interest",
          tags: [],
        },
      ],
      "transit",
    );

    expect(poi.tags).toContain("transit");
  });
});
