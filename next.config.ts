import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Excluye 'lightweight-charts' del bundle del servidor.
  // Esto evita el error "createContext is not a function" durante el build,
  // ya que la librería solo debe ejecutarse en el navegador.
  serverExternalPackages: ["lightweight-charts"],
};

export default nextConfig;
