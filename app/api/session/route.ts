import { type NextRequest, NextResponse } from "next/server";
import { PICKTRIP_TOKEN_COOKIE } from "@/src/lib/picktrip/config";
import { verifyPicktripToken } from "@/src/lib/picktrip/session";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(PICKTRIP_TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ authenticated: false });
  try {
    const user = await verifyPicktripToken(token);
    return NextResponse.json({ authenticated: true, user });
  } catch {
    const response = NextResponse.json({ authenticated: false }, { status: 401 });
    response.cookies.delete(PICKTRIP_TOKEN_COOKIE);
    return response;
  }
}
