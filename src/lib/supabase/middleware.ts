import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ROLE_HOME: Record<string, string> = {
  admin: "/admin",
  teacher: "/teacher",
  student: "/student",
};

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without credentials there is no session to refresh; let the page render
  // and surface the configuration error there rather than 500-ing every route.
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPortal =
    path.startsWith("/teacher") || path.startsWith("/student") || path.startsWith("/admin");

  if (!user && isPortal) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = path.startsWith("/admin") ? "/login/admin" : "/login";
    redirect.searchParams.set("next", path);
    return NextResponse.redirect(redirect);
  }

  // Signed-in users landing on a login page go straight to their dashboard.
  if (user && path.startsWith("/login")) {
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const home = profile?.role ? ROLE_HOME[profile.role] : null;
    if (home) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = home;
      redirect.search = "";
      return NextResponse.redirect(redirect);
    }
  }

  return response;
}
