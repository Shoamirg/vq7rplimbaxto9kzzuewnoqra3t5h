const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [],
  },
  transpilePackages: ["@garageos/design-system"],
  // Hide the floating Next.js "N" dev-tools badge (dev-only; never in prod).
  devIndicators: false,
  // Produce a self-contained server bundle for a lean production Docker image.
  // outputFileTracingRoot points at the monorepo root so workspace deps
  // (@garageos/design-system) get traced into the standalone output.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../"),
};

module.exports = nextConfig;
