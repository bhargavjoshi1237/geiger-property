import { NextResponse } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
import { isListingGone, listingPathParts } from '@/lib/leasing/public/gone'

export async function proxy(request) {
  // A leased or archived public listing answers 410 with its "no longer available" page (LEAS-01).
  const listing = listingPathParts(request.nextUrl.pathname)
  if (listing && (await isListingGone(listing.handle, listing.slug))) {
    const url = request.nextUrl.clone()
    url.pathname = `${request.nextUrl.pathname.replace(/\/$/, '')}/gone`
    return NextResponse.rewrite(url, { status: 410 })
  }
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
