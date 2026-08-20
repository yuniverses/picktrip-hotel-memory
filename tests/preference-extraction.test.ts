import { describe, expect, it } from "vitest";
import { extractExplicitPreferences } from "@/src/domain/preference-extraction";

describe("preference extraction", () => {
  it("extracts explainable transit and cafe signals without inventing coordinates", () => {
    const preferences = extractExplicitPreferences(
      "我通常很在意交通，希望靠近車站，也喜歡飯店附近有咖啡廳",
      "Tokyo",
    );

    expect(preferences.map((preference) => preference.category)).toEqual(["transit", "cafe"]);
    expect(preferences.every((preference) => preference.destination === "Tokyo")).toBe(true);
    expect(preferences.every((preference) => !("latitude" in preference))).toBe(true);
  });
});
