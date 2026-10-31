import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Le decimos a Webpack que ignore el paquete de Farcaster que Privy intenta cargar
    config.resolve.alias = {
      ...config.resolve.alias,
      '@farcaster/mini-app-solana': false,
    };
    return config;
  },
};

export default nextConfig;
