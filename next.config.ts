import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module — it must be required at runtime rather
  // than bundled.
  serverExternalPackages: ["better-sqlite3"],
  // Recipe photos (Spoonacular, TheMealDB), rendered with next/image in the v2 cards.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.spoonacular.com" },
      { protocol: "https", hostname: "spoonacular.com", pathname: "/recipeImages/**" },
      // TheMealDB photos for imported recipes (docs/catalog/). `search: ""`
      // rejects query strings, so nothing else on the host can be optimised.
      {
        protocol: "https",
        hostname: "www.themealdb.com",
        pathname: "/images/media/meals/**",
        search: "",
      },
    ],
  },
};

export default nextConfig;
