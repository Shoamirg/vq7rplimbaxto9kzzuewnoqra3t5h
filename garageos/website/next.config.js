// The sign-in and live demo pages belong to the GarageOS app, not this site.
const appUrl = (process.env.APP_URL || "https://app.garageos.uz").replace(/\/$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  // Self-contained server bundle for the production Docker image.
  output: "standalone",
  async redirects() {
    return [
      { source: "/login", destination: `${appUrl}/login`, permanent: false },
      { source: "/demo", destination: `${appUrl}/demo`, permanent: false },
    ];
  },
};

module.exports = nextConfig;
