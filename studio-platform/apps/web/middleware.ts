import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type Cookie = { name: string; value: string; options?: any };

// Keeps the sign-in session fresh and guards /studio (studio role) and /portal (any signed-in user).
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list: Cookie[]) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (path.startsWith("/studio")) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "studio") return NextResponse.redirect(new URL("/portal", request.url));
  }
  return response;
}

export const config = { matcher: ["/studio/:path*", "/portal/:path*"] };
