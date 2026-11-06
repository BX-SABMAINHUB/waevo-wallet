// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Paquetes que Next.js NO debe empaquetar y debe cargar desde node_modules en el servidor.
  // Incluimos el SDK de Hypermid para evitar el error "Cannot find module '@hypermid/sdk'" en runtime.
  serverExternalPackages: ["lightweight-charts", "@hypermid/sdk"],
  
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
