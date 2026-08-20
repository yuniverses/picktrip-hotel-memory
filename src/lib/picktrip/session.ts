import { getPicktripApiUrl } from "./config";

export type PicktripIdentity = {
  uid: string;
  name: string | null;
  imageUrl: string | null;
};

type Fetcher = typeof fetch;

export async function verifyPicktripToken(
  token: string,
  fetcher: Fetcher = fetch,
  apiUrl = getPicktripApiUrl(),
): Promise<PicktripIdentity> {
  const response = await fetcher(`${apiUrl}/app/user/read/me`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) throw new Error("Picktrip session is invalid");
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const data = asRecord(payload?.data) ?? payload;
  const uid = stringValue(data, ["userId", "id", "uid"]);
  if (!uid) throw new Error("Picktrip current-user response has no stable id");
  return {
    uid,
    name: stringValue(data, ["name", "displayName", "nickname"]),
    imageUrl: stringValue(data, ["imageUrl", "avatar", "avatarUrl", "photoURL"]),
  };
}

export function tokenFromAuthorization(authorization: string | null): string {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new Error("Authentication required");
  return match[1].trim();
}

export async function verifyPicktripBearer(authorization: string | null) {
  return verifyPicktripToken(tokenFromAuthorization(authorization));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(
  value: Record<string, unknown> | null | undefined,
  keys: string[],
): string | null {
  if (!value) return null;
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}
