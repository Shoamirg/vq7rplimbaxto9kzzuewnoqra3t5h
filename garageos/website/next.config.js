// The sign-in and live demo pages belong to the GarageOS app, not this site.
const appUrl = (process.env.APP_URL || "https://garageos.uz").replace(/\/$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  async redirects() {
    return [
      { source: "/login", destination: `${appUrl}/login`, permanent: false },
      { source: "/demo", destination: `${appUrl}/demo`, permanent: false },
    ];
  },
};

module.exports = nextConfig;
