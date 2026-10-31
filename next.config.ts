import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Excluye explícitamente 'lightweight-charts' del bundle del servidor.
  // Esto evita que Next.js intente ejecutar la librería (y su createContext)
  // durante el build en Node.js.
  serverExternalPackages: ["lightweight-charts"],
};

export default nextConfig;
