import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { PICKTRIP_TOKEN_COOKIE } from "@/src/lib/picktrip/config";
import { PicktripApiError, searchPicktripHotels } from "@/src/lib/picktrip/hotel-client";
import { verifyPicktripToken } from "@/src/lib/picktrip/session";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(PICKTRIP_TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Sign in to PickTrip first." }, { status: 401 });
  try {
    await verifyPicktripToken(token);
    const result = await searchPicktripHotels(await request.json(), token);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid hotel search", issues: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof PicktripApiError) {
      return NextResponse.json({ error: "Hotel search failed" }, { status: error.status });
    }
    return NextResponse.json({ error: "PickTrip session is invalid" }, { status: 401 });
  }
}
