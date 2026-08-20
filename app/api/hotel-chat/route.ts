import { type NextRequest, NextResponse } from "next/server";
import { hotelChatRequestSchema } from "@/src/domain/schemas";
import { PICKTRIP_TOKEN_COOKIE } from "@/src/lib/picktrip/config";
import { verifyPicktripToken } from "@/src/lib/picktrip/session";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(PICKTRIP_TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Sign in to PickTrip first." }, { status: 401 });
  try {
    await verifyPicktripToken(token);
  } catch {
    return NextResponse.json({ error: "PickTrip session is invalid" }, { status: 401 });
  }
  const parsed = hotelChatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid chat request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const mastraUrl = `${process.env.MASTRA_BASE_URL ?? "http://localhost:4111"}/hotel-chat`;
  const response = await fetch(mastraUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parsed.data),
    cache: "no-store",
  }).catch(() => null);
  if (!response) {
    return NextResponse.json(
      { error: "Mastra server is not running on port 4111" },
      { status: 503 },
    );
  }
  const payload = await response.json().catch(() => ({ error: "Invalid Mastra response" }));
  return NextResponse.json(payload, { status: response.status });
}
