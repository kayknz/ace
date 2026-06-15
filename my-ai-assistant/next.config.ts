import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true, // Crucial for static mobile bundles
  },
  transpilePackages: ['ai'],
};

export default nextConfig;