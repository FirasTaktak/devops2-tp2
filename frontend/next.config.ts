import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Produit .next/standalone : un serveur Node minimal, idéal pour une image Docker légère
  output: "standalone",
};

export default nextConfig;
