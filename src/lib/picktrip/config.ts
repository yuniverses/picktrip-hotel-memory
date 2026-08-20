export const PICKTRIP_TOKEN_COOKIE = "picktrip_token";

export function getPicktripApiUrl(): string {
  return (process.env.PICKTRIP_API_URL ?? "https://beta-api.picktrip.app").replace(/\/$/, "");
}
