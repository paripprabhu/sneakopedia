import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  httpAgentOptions: {
    keepAlive: true,
  },
  images: {
    remotePatterns: [
      // Image proxy (used for cross-origin thumbnails)
      { protocol: "https", hostname: "wsrv.nl" },
      // Retailer CDNs that appear in thumbnail URLs
      { protocol: "https", hostname: "*.shopify.com" },
      { protocol: "https", hostname: "crepdogcrew.com" },
      { protocol: "https", hostname: "*.crepdogcrew.com" },
      { protocol: "https", hostname: "mainstreet.co.in" },
      { protocol: "https", hostname: "*.mainstreet.co.in" },
      { protocol: "https", hostname: "images.vegnonveg.com" },
      { protocol: "https", hostname: "superkicks.in" },
      { protocol: "https", hostname: "*.superkicks.in" },
    ],
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7 days — sneaker images rarely change
  },
};

export default nextConfig;
