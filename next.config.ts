import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Evita que Webpack resuelva lightweight-charts en el servidor
      config.resolve.alias["lightweight-charts"] = false;
    }
    return config;
  },
};

export default nextConfig;
