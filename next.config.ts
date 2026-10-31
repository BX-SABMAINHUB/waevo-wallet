import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Obliga a Webpack a ignorar la librería en el bundle del servidor
      config.resolve.alias["lightweight-charts"] = false;
    }
    return config;
  },
};

export default nextConfig;
