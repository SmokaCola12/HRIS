/** @type {import('next').NextConfig} */
const configuredAppUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || process.env.APP_BASE_URL;
const configuredDevOrigins = [
  ...(process.env.ALLOWED_DEV_ORIGINS || '').split(','),
  configuredAppUrl || '',
]
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map((origin) => {
    try {
      return new URL(origin).host;
    } catch {
      return origin;
    }
  });

const nextConfig = {
  allowedDevOrigins: configuredDevOrigins,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

if (process.env.HRIS_STANDALONE === '1') {
  nextConfig.output = 'standalone';
}

export default nextConfig
