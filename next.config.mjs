/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    middlewareMode: "non-breaking", // Ensure middleware.ts is used
  },
}

export default nextConfig
