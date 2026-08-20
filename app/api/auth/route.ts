import { type NextRequest, NextResponse } from "next/server";
import { getPicktripApiUrl, PICKTRIP_TOKEN_COOKIE } from "@/src/lib/picktrip/config";
import { verifyPicktripToken } from "@/src/lib/picktrip/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { firebaseIdToken?: unknown } | null;
  const firebaseIdToken =
    typeof body?.firebaseIdToken === "string" ? body.firebaseIdToken.trim() : "";
  if (!firebaseIdToken) {
    return NextResponse.json({ error: "firebaseIdToken is required" }, { status: 400 });
  }

  const url = new URL("/app/signin", getPicktripApiUrl());
  url.searchParams.set("token", firebaseIdToken);
  const exchange = await fetch(url, {
    headers: { Authorization: `Bearer ${firebaseIdToken}`, Accept: "application/json" },
    cache: "no-store",
  }).catch(() => null);
  const exchangeBody = (await exchange?.json().catch(() => null)) as {
    data?: { token?: unknown };
  } | null;
  const token =
    exchange?.ok && typeof exchangeBody?.data?.token === "string"
      ? exchangeBody.data.token.trim()
      : "";
  if (!token) {
    return NextResponse.json({ error: "Firebase sign-in exchange failed" }, { status: 401 });
  }

  try {
    await verifyPicktripToken(token);
  } catch {
    return NextResponse.json({ error: "Picktrip session verification failed" }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(PICKTRIP_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(PICKTRIP_TOKEN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
