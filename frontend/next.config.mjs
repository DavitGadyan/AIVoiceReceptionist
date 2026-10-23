/** @type {import('next').NextConfig} */
const nextConfig = {
  // `standalone` traces exactly the files this app needs and emits a
  // self-contained server at .next/standalone/server.js - deployable to any
  // Node host, container or VM without node_modules travelling with it.
  output: "standalone",
  images: { formats: ["image/avif", "image/webp"] },
  poweredByHeader: false,
  // `next build` and `next dev` share .next by default, and a build run while the dev
  // server is up corrupts its manifests (every page 500s with no CSS). Set
  // NEXT_DIST_DIR=.next-build for builds you run alongside a dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
