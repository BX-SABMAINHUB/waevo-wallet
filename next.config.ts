import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Excluye la librería de gráficos del bundle del servidor (por si acaso)
  serverExternalPackages: ["lightweight-charts"],
  
  webpack: (config, { isServer }) => {
    // 🔥 SOLUCIÓN: Ignorar módulos de Node.js en el cliente
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
