import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { blockingProblems } from "@/lib/env-check";

/**
 * Dashboard gate:
 *  - if the environment isn't configured, show /setup instead of crashing;
 *  - refresh the Supabase session cookie and send signed-out users to /login.
 */
export async function proxy(request: NextRequest) {
  // Static references: the proxy bundle only sees env vars referenced by name.
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    ADMIN_EMAILS: process.env.ADMIN_EMAILS,
  };
  const problems = blockingProblems(env);
  if (problems.length) {
    console.warn(`[botly] not configured: ${problems.map((p) => `${p.name} (${p.problem})`).join(", ")}. Run \`npm run check\`.`);
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    url.search = "";
    return NextResponse.rewrite(url);
  }
  let response = NextResponse.next({ request });
  if (request.nextUrl.pathname === "/login") return response;

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(toSet) {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  let user = null;
  try {
    ({ data: { user } } = await supabase.auth.getUser());
  } catch (e) {
    console.error("[proxy] Supabase auth unreachable:", e instanceof Error ? e.message : e);
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    url.search = "?reason=unreachable";
    return NextResponse.rewrite(url);
  }
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = { matcher: ["/app/:path*", "/login"] };
