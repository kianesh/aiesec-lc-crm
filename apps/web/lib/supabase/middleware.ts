import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "../env";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = getPublicEnv();

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  // Routing only needs to know if a session cookie exists. getSession() reads
  // the signed cookie locally (refreshing over the network only when the token
  // is actually expired), which is far cheaper than getUser()'s mandatory
  // round-trip on every navigation. The real authz boundary is enforced at the
  // data layer (server components call getUser(), plus Postgres RLS).
  const {
    data: { session }
  } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const user = session?.user ?? null;

  const protectedPath = [
    "/dashboard",
    "/expa",
    "/contacts",
    "/conversations",
    "/social",
    "/email",
    "/integrations",
    "/settings"
  ].some((path) => request.nextUrl.pathname.startsWith(path));

  if (protectedPath && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname === "/sign-in") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
