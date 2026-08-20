import { describe, expect, it } from "vitest";
import {
  buildHotelMapMarkerSpecs,
  buildHotelSearchInput,
  DEFAULT_DESTINATION,
  DEFAULT_MAP_CENTER,
  hotelCameraIntent,
  keepDestinationLocalHotels,
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
  it("starts the standalone demo in San Francisco", () => {
    expect(DEFAULT_DESTINATION).toBe("San Francisco");
    expect(DEFAULT_MAP_CENTER).toEqual([-122.4194, 37.7749]);
  });

  it("focuses default empty state on San Francisco and fits only hotel coordinates", () => {
    expect(hotelCameraIntent(DEFAULT_DESTINATION, [])).toEqual({
      key: "center:San Francisco",
      type: "center",
      center: DEFAULT_MAP_CENTER,
      zoom: 11.8,
    });

    const hotelSpecs = buildHotelMapMarkerSpecs([hotel], []);
    const withPoi = buildHotelMapMarkerSpecs(
      [hotel],
      [
        {
          id: "cafe:outside",
          entityId: "outside",
          kind: "cafe",
          title: "Faraway cafe",
          latitude: 40.7128,
          longitude: -74.006,
          reason: "Cafe preference",
          preferenceIds: ["pref-cafe"],
          score: 0.8,
          source: "picktrip-place-api",
        },
      ],
    );

    expect(hotelCameraIntent("San Francisco", withPoi)).toEqual(
      hotelCameraIntent("San Francisco", hotelSpecs),
    );
    expect(hotelCameraIntent("San Francisco", withPoi)).toMatchObject({
      type: "bounds",
      specs: [{ kind: "hotel" }],
    });
  });

  it("uses a geo-only San Francisco request and excludes global outliers from its camera", () => {
    expect(buildHotelSearchInput("San Francisco")).toEqual({
      geo: { lat: 37.7749, lng: -122.4194, radiusKm: 30 },
      hitsPerPage: 30,
      page: 0,
      currency: "TWD",
    });

    const [sanFranciscoHotel] = keepDestinationLocalHotels("San Francisco", [
      { ...hotel, hotelId: "sf", latitude: 37.7858, longitude: -122.4064 },
      { ...hotel, hotelId: "cabo", latitude: 22.8905, longitude: -109.9167 },
    ]);

    expect(sanFranciscoHotel.hotelId).toBe("sf");
    expect(buildHotelSearchInput("Paris")).toMatchObject({ q: "Paris", hitsPerPage: 30 });
  });

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
