import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PICKTRIP_TOKEN_COOKIE } from "@/src/lib/picktrip/config";
import { PicktripApiError } from "@/src/lib/picktrip/hotel-client";
import { fetchHotelLowestPrices } from "@/src/lib/picktrip/hotel-commerce";
import { verifyPicktripToken } from "@/src/lib/picktrip/session";

const requestSchema = z.object({
  hotelIds: z.array(z.string().min(1)).min(1).max(200),
  checkIn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default("2026-09-23"),
  checkOut: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default("2026-09-26"),
  currency: z.string().length(3).default("TWD"),
  adults: z.number().int().min(1).max(30).default(2),
  children: z.number().int().min(0).max(30).default(0),
  rooms: z.number().int().min(1).max(30).default(1),
  nationality: z.string().min(2).max(3).optional(),
});

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.checkOut <= parsed.data.checkIn) {
    return NextResponse.json({ error: "Invalid stay or party details." }, { status: 400 });
  }
  const token = request.cookies.get(PICKTRIP_TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Sign in to view live prices." }, { status: 401 });
  try {
    await verifyPicktripToken(token);
  } catch {
    return NextResponse.json({ error: "Your PickTrip session has expired." }, { status: 401 });
  }
  try {
    return NextResponse.json({ prices: await fetchHotelLowestPrices(parsed.data, token) });
  } catch (error) {
    const status = error instanceof PicktripApiError ? error.status : 502;
    return NextResponse.json({ error: "Live prices are temporarily unavailable." }, { status });
  }
}
