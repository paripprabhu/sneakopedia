import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true, // Zips text files (makes them 70% smaller)
  httpAgentOptions: {
    keepAlive: true, // Keeps connection open for faster repeated searches
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" }, // Allows all external images
    ],
    minimumCacheTTL: 60 * 60 * 24, // Cache images for 24 hours
  },
};

export default nextConfig;