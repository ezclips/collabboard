import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // 5,426 pre-existing lint errors block `next build` (Phase 0 audit).
    // Lint runs separately via `npm run lint`; build gates on compile + types.
    // Remove once the lint burn-down reaches zero (tracked in .fable5/docs/CURRENT_TASK.md).
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // Step 1: strip the "node:" URI scheme prefix so webpack can resolve
      // the module normally. pptxgenjs (and jspdf) use "node:fs" etc. which
      // webpack 5 doesn't handle by default in a browser target.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
          resource.request = resource.request.replace(/^node:/, "");
        })
      );

      // Step 2: stub out the bare Node built-in names so the browser bundle
      // gets empty modules. pptxgenjs's browser code paths never call them.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        https: false,
        http: false,
        zlib: false,
        stream: false,
        path: false,
        crypto: false,
        buffer: false,
        url: false,
        util: false,
      };
    }
    return config;
  },
};

export default nextConfig;
