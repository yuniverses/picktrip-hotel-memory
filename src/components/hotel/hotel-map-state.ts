import type { MapPin } from "@/src/domain/schemas";
import { type DisplayHotel, formatStayTotal } from "@/src/lib/picktrip/hotel-commerce";

export const DEFAULT_DESTINATION = "San Francisco";
export const DEFAULT_MAP_CENTER: [longitude: number, latitude: number] = [-122.4194, 37.7749];
export const DEFAULT_DESTINATION_RADIUS_KM = 30;

export function buildHotelSearchInput(destination: string) {
  const base = { hitsPerPage: 30, page: 0, currency: "TWD" as const };
  if (isDefaultDestination(destination)) {
    return {
      ...base,
      geo: {
        lat: DEFAULT_MAP_CENTER[1],
        lng: DEFAULT_MAP_CENTER[0],
        radiusKm: DEFAULT_DESTINATION_RADIUS_KM,
      },
    };
  }
  return { ...base, q: destination };
}

export function keepDestinationLocalHotels<T extends { latitude: number; longitude: number }>(
  destination: string,
  hotels: T[],
): T[] {
  if (!isDefaultDestination(destination)) return hotels;
  return hotels.filter(
    (hotel) =>
      distanceKm({ latitude: DEFAULT_MAP_CENTER[1], longitude: DEFAULT_MAP_CENTER[0] }, hotel) <=
      DEFAULT_DESTINATION_RADIUS_KM,
  );
}

function isDefaultDestination(destination: string): boolean {
  return destination.trim().toLowerCase() === DEFAULT_DESTINATION.toLowerCase();
}

function distanceKm(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
): number {
  const radians = (value: number) => (value * Math.PI) / 180;
  const deltaLatitude = radians(second.latitude - first.latitude);
  const deltaLongitude = radians(second.longitude - first.longitude);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type HotelMapMarkerSpec = MapPin & {
  label: string;
  aiRecommended: boolean;
};

export type HotelCameraIntent =
  | {
      type: "center";
      key: string;
      center: typeof DEFAULT_MAP_CENTER;
      zoom: number;
    }
  | { type: "bounds"; key: string; specs: HotelMapMarkerSpec[] };

const visualMarkerClasses = [
  "map-marker",
  "marker-hotel",
  "marker-cafe",
  "marker-transit",
  "marker-attraction",
  "marker-ai",
  "is-selected",
] as const;

export function markerAnchorForKind(kind: MapPin["kind"]): "bottom" | "center" {
  return kind === "hotel" ? "bottom" : "center";
}

export function mergeMarkerClassNames(
  existingClassName: string,
  spec: HotelMapMarkerSpec,
  selected: boolean,
): string {
  const classes = new Set(existingClassName.split(/\s+/).filter(Boolean));
  for (const className of visualMarkerClasses) classes.delete(className);
  classes.add("map-marker");
  classes.add(`marker-${spec.kind}`);
  if (spec.aiRecommended) classes.add("marker-ai");
  if (selected) classes.add("is-selected");
  return [...classes].join(" ");
}

export function buildHotelMapMarkerSpecs(
  hotels: DisplayHotel[],
  aiPins: MapPin[],
): HotelMapMarkerSpec[] {
  const specs = new Map<string, HotelMapMarkerSpec>();
  for (const hotel of hotels) {
    specs.set(`hotel:${hotel.hotelId}`, {
      id: `hotel:${hotel.hotelId}`,
      entityId: hotel.hotelId,
      kind: "hotel",
      title: hotel.name || hotel.nameEn,
      latitude: hotel.latitude,
      longitude: hotel.longitude,
      reason: "PickTrip hotel search result",
      preferenceIds: [],
      score: 0,
      source: "picktrip-hotel-api",
      label: formatStayTotal(hotel.stayPrice) ?? "Hotel",
      aiRecommended: false,
    });
  }
  for (const pin of aiPins) {
    const current = specs.get(pin.id);
    specs.set(pin.id, {
      ...pin,
      label:
        current?.label ??
        (pin.kind === "hotel"
          ? "Recommended"
          : pin.kind === "cafe"
            ? "☕"
            : pin.kind === "transit"
              ? "🚉"
              : "◆"),
      aiRecommended: pin.kind === "hotel" && pin.preferenceIds.length > 0,
    });
  }
  return [...specs.values()];
}

export function markerBoundsKey(specs: HotelMapMarkerSpec[]): string {
  return specs
    .map((spec) => `${spec.id}:${spec.longitude.toFixed(5)},${spec.latitude.toFixed(5)}`)
    .sort()
    .join("|");
}

export function hotelCameraIntent(
  destination: string,
  specs: HotelMapMarkerSpec[],
): HotelCameraIntent | null {
  const hotels = specs.filter((spec) => spec.kind === "hotel");
  if (hotels.length > 0) {
    return { type: "bounds", key: `hotels:${markerBoundsKey(hotels)}`, specs: hotels };
  }
  if (destination === DEFAULT_DESTINATION) {
    return {
      type: "center",
      key: `center:${DEFAULT_DESTINATION}`,
      center: DEFAULT_MAP_CENTER,
      zoom: 11.8,
    };
  }
  return null;
}
