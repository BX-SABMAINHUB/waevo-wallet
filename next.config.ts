import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 1. Evita que Next.js intente empaquetar los paquetes de Solana en el servidor
  // Esto soluciona el error "Module not found: Can't resolve '@solana/kit'"
  serverExternalPackages: [
    "@solana/kit",
    "@solana-program/memo",
    "@solana-program/system",
    "@solana-program/token",
  ],

  // 2. Configuración de Webpack para ignorar el paquete de Farcaster
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@farcaster/mini-app-solana": false,
    };
    return config;
  },
};

export default nextConfig;
