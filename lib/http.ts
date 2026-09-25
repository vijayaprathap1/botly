import { NextResponse } from "next/server";

/** CORS for the public widget endpoints: echo the caller's origin (access is decided per bot). */
export function corsHeaders(origin: string | null): Record<string, string> {
  return origin
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      }
    : { Vary: "Origin" };
}

export function preflight(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export function json(req: Request, body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...corsHeaders(req.headers.get("origin")), ...extra } });
}

/** The widget sends JSON as text/plain to avoid a CORS preflight; accept both. */
export async function readJsonBody(req: Request, maxBytes = 16_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new Error("Body too large");
  return JSON.parse(text);
}

export function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  return (xff?.split(",")[0]?.trim() || req.headers.get("x-real-ip")) ?? null;
}
