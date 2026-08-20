export type PreferenceCategory =
  | "transit"
  | "cafe"
  | "food"
  | "budget"
  | "room"
  | "neighborhood"
  | "avoid";

export type ExtractedPreference = {
  category: PreferenceCategory;
  polarity: "prefer" | "require" | "avoid";
  statement: string;
  confidence: number;
  tags: string[];
  destination?: string;
};

const signals: Array<{ category: PreferenceCategory; pattern: RegExp; tags: string[] }> = [
  { category: "transit", pattern: /交通|車站|捷運|地鐵|train|station|transit/i, tags: ["transit"] },
  { category: "cafe", pattern: /咖啡|café|cafe|coffee/i, tags: ["cafe"] },
  { category: "food", pattern: /餐廳|美食|早餐|restaurant|food/i, tags: ["food"] },
  { category: "budget", pattern: /預算|便宜|價格|budget|price/i, tags: ["budget"] },
  { category: "room", pattern: /房間|床|安靜|room|bed|quiet/i, tags: ["room"] },
  {
    category: "neighborhood",
    pattern: /區域|街區|熱鬧|neighborhood|district/i,
    tags: ["neighborhood"],
  },
];

export function extractExplicitPreferences(
  message: string,
  destination?: string,
): ExtractedPreference[] {
  const avoid = /不要|避免|不喜歡|avoid|hate/i.test(message);
  return signals
    .filter((signal) => signal.pattern.test(message))
    .map((signal) => ({
      category: signal.category,
      polarity: avoid ? "avoid" : /一定|必須|需要|must|need/i.test(message) ? "require" : "prefer",
      statement: message.trim(),
      confidence: 0.92,
      tags: signal.tags,
      destination,
    }));
}
