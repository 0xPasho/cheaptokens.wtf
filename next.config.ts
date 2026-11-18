import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El build del servidor compila en un directorio aparte y luego lo intercambia (deploy/build.sh, ADR-0059).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
