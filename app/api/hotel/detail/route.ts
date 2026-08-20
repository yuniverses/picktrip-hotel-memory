import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PICKTRIP_TOKEN_COOKIE } from "@/src/lib/picktrip/config";
import { PicktripApiError } from "@/src/lib/picktrip/hotel-client";
import { fetchHotelDetail } from "@/src/lib/picktrip/hotel-commerce";
import { verifyPicktripToken } from "@/src/lib/picktrip/session";

const requestSchema = z.object({ hotelId: z.string().min(1) });

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid hotel id." }, { status: 400 });
  const token = request.cookies.get(PICKTRIP_TOKEN_COOKIE)?.value;
  if (!token)
    return NextResponse.json({ error: "Sign in to view hotel details." }, { status: 401 });
  try {
    await verifyPicktripToken(token);
  } catch {
    return NextResponse.json({ error: "Your PickTrip session has expired." }, { status: 401 });
  }
  try {
    const detail = await fetchHotelDetail(parsed.data.hotelId, token);
    if (!detail)
      return NextResponse.json({ error: "Hotel details were not found." }, { status: 404 });
    return NextResponse.json({ detail });
  } catch (error) {
    const status = error instanceof PicktripApiError ? error.status : 502;
    return NextResponse.json({ error: "Hotel details are temporarily unavailable." }, { status });
  }
}
