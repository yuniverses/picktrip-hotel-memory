import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { PICKTRIP_TOKEN_COOKIE } from "@/src/lib/picktrip/config";
import { PicktripApiError } from "@/src/lib/picktrip/hotel-client";
import { searchPicktripPlaces } from "@/src/lib/picktrip/place-client";
import { verifyPicktripToken } from "@/src/lib/picktrip/session";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(PICKTRIP_TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Sign in to PickTrip first." }, { status: 401 });
  try {
    await verifyPicktripToken(token);
    return NextResponse.json({ cards: await searchPicktripPlaces(await request.json(), token) });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid place search", issues: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof PicktripApiError) {
      return NextResponse.json({ error: "Place search failed" }, { status: error.status });
    }
    return NextResponse.json({ error: "PickTrip session is invalid" }, { status: 401 });
  }
}
