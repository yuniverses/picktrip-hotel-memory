import type { MapPin } from "@/src/domain/schemas";
import { type DisplayHotel, formatStayTotal } from "@/src/lib/picktrip/hotel-commerce";

export type HotelMapMarkerSpec = MapPin & {
  label: string;
  aiRecommended: boolean;
};

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
