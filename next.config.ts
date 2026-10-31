import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Obliga a Webpack a ignorar los módulos nativos de Node.js
      // que usa coinlib-sdk internamente en el navegador.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        dns: false,
        tls: false,
        path: false,
        crypto: false,
        child_process: false,
        http: false,
        https: false,
        stream: false,
        buffer: false,
        util: false,
        url: false,
        zlib: false,
      };
    }
    return config;
  },
};

export default nextConfig;
