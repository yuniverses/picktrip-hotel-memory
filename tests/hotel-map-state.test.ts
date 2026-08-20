import { describe, expect, it } from "vitest";
import {
  buildHotelMapMarkerSpecs,
  markerAnchorForKind,
  markerBoundsKey,
  mergeMarkerClassNames,
} from "@/src/components/hotel/hotel-map-state";
import type { DisplayHotel } from "@/src/lib/picktrip/hotel-commerce";

const hotel: DisplayHotel = {
  hotelId: "hotel-1",
  name: "Tokyo Station Hotel",
  nameEn: "",
  starRating: 5,
  ratingScore: 9.2,
  reviewCount: 20,
  categoryName: "Hotel",
  primaryImage: "",
  latitude: 35.6812,
  longitude: 139.7671,
  address: "Tokyo",
  cityName: "Tokyo",
  countryCode: "JP",
  countryName: "Japan",
  destinationName: "Tokyo",
  highlights: [],
  minPriceCache: null,
  siteId: "",
  priceStatus: "ready",
  stayPrice: {
    hotelId: "hotel-1",
    displayPriceFrom: 24000,
    displayPricePerNightFrom: 8000,
    displayStayTotalFrom: 24000,
    priceBasis: "STAY_TOTAL",
    displayCurrency: "TWD",
    fractionDigits: 2,
    displayFractionDigits: 0,
  },
};

describe("hotel map marker state", () => {
  it("keeps one stable hotel id and retains its true stay-total label when AI recommends it", () => {
    const specs = buildHotelMapMarkerSpecs(
      [hotel],
      [
        {
          id: "hotel:hotel-1",
          entityId: "hotel-1",
          kind: "hotel",
          title: "Tokyo Station Hotel",
          latitude: 35.6812,
          longitude: 139.7671,
          reason: "Matches transit preference",
          preferenceIds: ["pref-1"],
          score: 0.9,
          source: "picktrip-hotel-api",
        },
      ],
    );

    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({
      id: "hotel:hotel-1",
      label: "NT$24,000",
      aiRecommended: true,
    });
  });

  it("keeps bounds stable across price-only changes and differentiates POI kinds", () => {
    const before = buildHotelMapMarkerSpecs([{ ...hotel, stayPrice: null }], []);
    const after = buildHotelMapMarkerSpecs(
      [hotel],
      [
        {
          id: "cafe:cafe-1",
          entityId: "cafe-1",
          kind: "cafe",
          title: "Coffee",
          latitude: 35.69,
          longitude: 139.77,
          reason: "Cafe preference",
          preferenceIds: ["pref-2"],
          score: 0.8,
          source: "picktrip-place-api",
        },
      ],
    );

    expect(markerBoundsKey(before)).toBe(
      markerBoundsKey(after.filter((spec) => spec.kind === "hotel")),
    );
    expect(after.find((spec) => spec.kind === "cafe")?.label).toBe("☕");
  });

  it("preserves Mapbox positioning classes while updating visual marker state", () => {
    const [spec] = buildHotelMapMarkerSpecs([hotel], []);
    const className = mergeMarkerClassNames(
      "mapboxgl-marker mapboxgl-marker-anchor-bottom marker-cafe is-selected",
      spec,
      false,
    );

    expect(className).toContain("mapboxgl-marker");
    expect(className).toContain("mapboxgl-marker-anchor-bottom");
    expect(className).toContain("marker-hotel");
    expect(className).not.toContain("marker-cafe");
    expect(className).not.toContain("is-selected");
  });

  it("anchors hotel labels at their bottom edge and circular POIs at their center", () => {
    expect(markerAnchorForKind("hotel")).toBe("bottom");
    expect(markerAnchorForKind("cafe")).toBe("center");
    expect(markerAnchorForKind("transit")).toBe("center");
    expect(markerAnchorForKind("attraction")).toBe("center");
  });
});
