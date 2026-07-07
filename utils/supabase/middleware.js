import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

// Picks up the parent project's session from the suite's shared auth cookie and
// refreshes it on every request, so the token stays valid for server components
// and the browser client. Property has no local login (the parent Geiger
// dashboard owns auth), so this is refresh-only — it never gates or redirects.

function isStaticAssetPath(pathname) {
  return /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|json|woff|woff2|ttf|otf)$/i.test(pathname)
}

export async function updateSession(request) {
  if (isStaticAssetPath(request.nextUrl.pathname)) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Touch the session so Supabase refreshes/rotates the shared auth cookie.
  await supabase.auth.getUser()

  return supabaseResponse
}
