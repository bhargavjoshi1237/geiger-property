const isProd = process.env.NODE_ENV === 'production';

// Security headers (PLAT-01f). No nonces: Next's inline bootstrap scripts need 'unsafe-inline' without them, and
// nonces would force every page dynamic. Stripe and the Supabase project are the only third parties the browser talks to.
const supabase = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
  } catch {
    return '';
  }
})();
const supabaseSocket = supabase.replace(/^http/, 'ws');

const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"} https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  // Listing photos, logos and covers can come from any https host (Supabase storage, Vercel Blob, pasted links).
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' data: blob: https:",
  `connect-src 'self' ${supabase} ${supabaseSocket} https://api.stripe.com${isProd ? '' : ' ws: wss:'}`.replace(/\s+/g, ' '),
  "frame-src 'self' blob: https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  ...(isProd ? ['upgrade-insecure-requests'] : []),
];

// The landing page and geiger-dash (same origin behind its /property rewrite) iframe the playground; the public
// vacancy widget (LEAS-01, /l/<handle>/embed) is framed by landlords' own sites.
const contentSecurityPolicy = [...cspDirectives, "frame-ancestors 'self'"].join('; ');
const embedContentSecurityPolicy = [...cspDirectives, 'frame-ancestors *'].join('; ');

const sharedHeaders = [
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Chat calls use the camera and microphone; nothing else asks for device features.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), display-capture=(self), geolocation=(), browsing-topics=()' },
  // HTTPS only, in production; no includeSubDomains because geiger-dash owns the domain.
  ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000' }] : []),
];

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  ...sharedHeaders,
];
const embedHeaders = [{ key: 'Content-Security-Policy', value: embedContentSecurityPolicy }, ...sharedHeaders];

// Every path except /l/<handle>/embed (path-to-regexp has no leading lookahead, so the embed path is spelled out).
const NOT_EMBED = '/:path([^l].*|l|l[^/].*|l/[^/]*|l/[^/]+/(?!embed/?$).*)';

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@geiger/ui", "@geiger/notify"],
  // Served under /property in production via the dash's /property/:path* rewrite.
  basePath: isProd ? '/property' : '',
  allowedDevOrigins: ['127.0.0.1'],
  env: {
    NEXT_PUBLIC_BASE_PATH: isProd ? '/property' : '',
  },
  // basePath is prefixed automatically, so this covers every page, route handler and public file.
  async headers() {
    return [
      { source: '/', headers: securityHeaders },
      { source: NOT_EMBED, headers: securityHeaders },
      { source: '/l/:handle/embed', headers: embedHeaders },
    ];
  },
};

export default nextConfig;
