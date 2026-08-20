import type {
  HotelCandidate,
  MapPin,
  PoiCandidate,
  RecalledPreference,
  RecommendationReason,
} from "./schemas";

export type PersonalizationResult = {
  pins: MapPin[];
  reasons: RecommendationReason[];
};

export function personalizeCandidates(input: {
  hotels: HotelCandidate[];
  pois: PoiCandidate[];
  preferences: RecalledPreference[];
}): PersonalizationResult {
  const transitPreferences = input.preferences.filter((item) => item.category === "transit");
  const cafePreferences = input.preferences.filter((item) => item.category === "cafe");
  const relevantPois = input.pois.filter((poi) => {
    const kind = poiKind(poi);
    return (
      (kind === "transit" && transitPreferences.length > 0) ||
      (kind === "cafe" && cafePreferences.length > 0) ||
      kind === "attraction"
    );
  });
  const rankedHotels = input.hotels
    .map((hotel) => {
      const matchingPois = relevantPois.filter((poi) => {
        const kind = poiKind(poi);
        return (
          (kind === "transit" && transitPreferences.length > 0) ||
          (kind === "cafe" && cafePreferences.length > 0)
        );
      });
      const nearestKm = matchingPois.length
        ? Math.min(...matchingPois.map((poi) => distanceKm(hotel, poi)))
        : 3;
      const proximity = Math.max(0, 1 - nearestKm / 3);
      const rating = hotel.ratingScore ? hotel.ratingScore / 10 : hotel.starRating / 5;
      return { hotel, score: clamp(rating * 0.7 + proximity * 0.3) };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);

  const preferenceIds = input.preferences.map((item) => item.id);
  const preferenceLabel = preferenceSummary(input.preferences);
  const hotelPins: MapPin[] = rankedHotels.map(({ hotel, score }) => ({
    id: `hotel:${hotel.hotelId}`,
    entityId: hotel.hotelId,
    kind: "hotel",
    title: hotel.name || hotel.nameEn,
    latitude: hotel.latitude,
    longitude: hotel.longitude,
    reason: preferenceLabel
      ? `Matches your ${preferenceLabel} preference${input.preferences.length === 1 ? "" : "s"}`
      : "A highly rated option in the current search",
    preferenceIds,
    score,
    source: "picktrip-hotel-api",
  }));
  const selectedPois = selectPois(
    relevantPois,
    input.preferences,
    Math.min(6, 12 - hotelPins.length),
  );
  const poiPins: MapPin[] = selectedPois.map((poi) => {
    const kind = poiKind(poi);
    const matchingPreferences = input.preferences.filter((item) => item.category === kind);
    return {
      id: `${kind}:${poi.placeId}`,
      entityId: poi.placeId,
      kind,
      title: poi.title,
      latitude: poi.latitude,
      longitude: poi.longitude,
      reason: matchingPreferences.length
        ? `Added because you often care about ${kind === "cafe" ? "cafes" : "transit"}`
        : "Nearby place",
      preferenceIds: matchingPreferences.map((item) => item.id),
      score: 0.85,
      source: "picktrip-place-api",
    };
  });
  const pins = [...hotelPins, ...poiPins];
  return {
    pins,
    reasons: pins.map((pin) => ({
      entityId: pin.entityId,
      reason: pin.reason,
      preferenceIds: pin.preferenceIds,
    })),
  };
}

function selectPois(
  relevantPois: PoiCandidate[],
  preferences: RecalledPreference[],
  limit: number,
): PoiCandidate[] {
  if (limit <= 0) return [];
  const requiredKinds = (["cafe", "transit"] as const).filter((kind) =>
    preferences.some((preference) => preference.category === kind),
  );
  const selected = new Map<string, PoiCandidate>();
  for (const kind of requiredKinds) {
    const match = relevantPois.find((poi) => poiKind(poi) === kind);
    if (match) selected.set(match.placeId, match);
  }
  for (const poi of relevantPois) {
    if (selected.size >= limit) break;
    selected.set(poi.placeId, poi);
  }
  return [...selected.values()].slice(0, limit);
}

export function poiKind(poi: PoiCandidate): "cafe" | "transit" | "attraction" {
  const terms = [poi.primaryType, ...poi.tags].join(" ").toLowerCase();
  if (/cafe|coffee|咖啡/.test(terms)) return "cafe";
  if (/station|train|metro|subway|transit|transport|車站|地鐵/.test(terms)) return "transit";
  return "attraction";
}

function preferenceSummary(preferences: RecalledPreference[]): string {
  return [
    preferences.some((item) => item.category === "transit") ? "transit" : "",
    preferences.some((item) => item.category === "cafe") ? "cafes" : "",
  ]
    .filter(Boolean)
    .join(" and ");
}

function distanceKm(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
): number {
  const radians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = radians(second.latitude - first.latitude);
  const deltaLng = radians(second.longitude - first.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(deltaLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
