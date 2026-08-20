import { describe, expect, it } from "vitest";
import { createInitialHotelState, reduceHotelState } from "@/src/domain/hotel-state";
import type { MapPin } from "@/src/domain/schemas";

const hotel: MapPin = {
  id: "hotel:h-1",
  entityId: "h-1",
  kind: "hotel",
  title: "Ueno Hotel",
  latitude: 35.71,
  longitude: 139.78,
  reason: "Near transit",
  preferenceIds: ["pref-transit"],
  score: 0.8,
  source: "picktrip-hotel-api",
};

describe("hotel state reducer", () => {
  it("upserts stable ids without duplicating pins between turns", () => {
    const first = reduceHotelState(createInitialHotelState("Tokyo"), {
      type: "apply-pin-operations",
      operations: [{ operation: "upsert", pins: [hotel] }],
    });
    const second = reduceHotelState(first, {
      type: "apply-pin-operations",
      operations: [
        {
          operation: "upsert",
          pins: [{ ...hotel, score: 0.95, reason: "Matches your latest transit preference" }],
        },
      ],
    });

    expect(second.pins).toHaveLength(1);
    expect(second.pins[0]).toMatchObject({ score: 0.95, id: "hotel:h-1" });
  });

  it("clears visible pins and thread on destination change but retains preferences", () => {
    const populated = {
      ...createInitialHotelState("Tokyo"),
      threadId: "thread-tokyo",
      pins: [hotel],
      recalledPreferences: [{ id: "pref-transit", statement: "Prefer train stations" }],
    };
    const changed = reduceHotelState(populated, {
      type: "destination-changed",
      destination: "Osaka",
      threadId: "thread-osaka",
    });

    expect(changed.destination).toBe("Osaka");
    expect(changed.threadId).toBe("thread-osaka");
    expect(changed.pins).toEqual([]);
    expect(changed.recalledPreferences).toEqual(populated.recalledPreferences);
  });
});
