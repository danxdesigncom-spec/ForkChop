import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module — it must be required at runtime rather
  // than bundled.
  serverExternalPackages: ["better-sqlite3"],
  // Spoonacular recipe photos, rendered with next/image in the v2 cards.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.spoonacular.com" },
      { protocol: "https", hostname: "spoonacular.com", pathname: "/recipeImages/**" },
    ],
  },
};

export default nextConfig;
