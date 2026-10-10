const isProd = process.env.NODE_ENV === 'production';

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@geiger/ui"],
  // Served under /property in production via the dash's /property/:path* rewrite.
  basePath: isProd ? '/property' : '',
  allowedDevOrigins: ['127.0.0.1'],
  env: {
    NEXT_PUBLIC_BASE_PATH: isProd ? '/property' : '',
  },
};

export default nextConfig;
