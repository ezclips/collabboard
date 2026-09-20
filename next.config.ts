import type { NextConfig } from "next";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const E2E_BRIDGE_BUILD = process.env.E2E_BRIDGE_BUILD === "1";

const nextConfig: NextConfig = {
  // @napi-rs/canvas is native; Next externalizes sharp by default but not this,
  // so the F9-C1 crop route would otherwise get bundled into the client graph.
  serverExternalPackages: ['@napi-rs/canvas'],
  // DOCX extraction runs in a worker thread, loaded by PATH at runtime rather
  // than imported. Nothing in the module graph references the file, so the
  // build's tracing cannot see it and a packaged output would ship without it.
  //
  // NAMING THE WORKER IS NOT ENOUGH, which the trace manifest says plainly:
  // after adding the file alone, the route's .nft.json carried the worker and
  // exactly one package, `next`. The application's own libraries are bundled
  // INTO route.js by webpack, so they need no tracing -- but the worker is not
  // bundled. It is plain CommonJS calling require('mammoth') at runtime, and
  // that require is invisible to both webpack and the tracer. A packaged
  // deployment would therefore ship a worker with nothing to load, and every
  // DOCX upload would fail IN PRODUCTION ONLY, with the same "could not be
  // read" message a corrupt file gets.
  //
  // So mammoth's whole runtime closure is named here. The list is explicit
  // rather than a wildcard because a wildcard over node_modules would ship the
  // entire tree; it is kept honest by knowledgeDocxDeployment.test.ts, which
  // recomputes the closure from package.json and fails if anything is missing.
  outputFileTracingIncludes: {
    '/api/boards/[id]/knowledge': [
      './lib/infra/knowledge/knowledgeDocxWorker.cjs',
      './node_modules/@xmldom/xmldom/**/*',
      './node_modules/argparse/**/*',
      './node_modules/base64-js/**/*',
      './node_modules/bluebird/**/*',
      './node_modules/core-util-is/**/*',
      './node_modules/dingbat-to-unicode/**/*',
      './node_modules/duck/**/*',
      './node_modules/immediate/**/*',
      './node_modules/inherits/**/*',
      './node_modules/isarray/**/*',
      './node_modules/jszip/**/*',
      './node_modules/lie/**/*',
      './node_modules/lop/**/*',
      './node_modules/mammoth/**/*',
      './node_modules/option/**/*',
      './node_modules/pako/**/*',
      './node_modules/path-is-absolute/**/*',
      './node_modules/process-nextick-args/**/*',
      './node_modules/readable-stream/**/*',
      './node_modules/safe-buffer/**/*',
      './node_modules/setimmediate/**/*',
      './node_modules/string_decoder/**/*',
      './node_modules/underscore/**/*',
      './node_modules/util-deprecate/**/*',
      './node_modules/xmlbuilder/**/*',
    ],
  },
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
  webpack: (config, { dev, isServer, webpack }) => {
    // DEV WATCHER SCOPE.
    //
    // Next only ignores node_modules and .next by default, so ANY tool that
    // writes inside the project feeds the watcher. The persistent Playwright
    // Chromium keeps its profile at .runtime-fixtures/playwright-profile and
    // rewrites Cache/Code Cache/sqldb-wal files continuously, which put dev
    // into a permanent recompile loop -- observed rewriting the root layout
    // chunk every ~6 seconds with the editor closed and no requests in flight.
    //
    // That loop is not merely wasted CPU. A request arriving mid-rewrite is
    // served a gzip stream of a file webpack is still writing, so the browser
    // receives a TRUNCATED script and throws "Invalid or unexpected token".
    // The root layout chunk then never executes, React never hydrates, and
    // every onClick on the page is silently dead while the markup looks fine.
    //
    // These directories hold runtime artifacts, never source, so nothing here
    // should ever trigger a rebuild.
    if (dev) {
      config.watchOptions = {
        ...(config.watchOptions ?? {}),
        ignored: [
          '**/node_modules/**',
          '**/.next/**',
          '**/.git/**',
          '**/.runtime-fixtures/**',
          '**/.playwright-mcp/**',
          '**/test-results/**',
          '**/playwright-report/**',
        ],
      };
    }

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
    if (config.cache && typeof config.cache === "object") {
      const current = "version" in config.cache ? config.cache.version : "";
      config.cache.version = `${current ?? ""}|collabboard-e2e-bridge:${E2E_BRIDGE_BUILD ? "on" : "off"}`;
    }
    if (E2E_BRIDGE_BUILD) {
      config.resolve.alias = {
        ...config.resolve.alias,
        [`${path.resolve(process.cwd(), "lib/e2e/bridgeRegistration.ts")}$`]:
          path.resolve(process.cwd(), "lib/e2e/bridgeRegistration.e2e.ts"),
        [`${path.resolve(process.cwd(), "lib/e2e/drawingResizeFixture.tsx")}$`]:
          path.resolve(process.cwd(), "lib/e2e/drawingResizeFixture.e2e.tsx"),
      };
    }
    config.plugins.push({
      apply(compiler: any) {
        compiler.hooks.done.tap("CollabboardE2EBridgeArtifactMarker", () => {
          const marker = path.join(process.cwd(), ".next", "E2E_BRIDGE_BUILD");
          if (E2E_BRIDGE_BUILD) writeFileSync(marker, "1\n");
          else if (existsSync(marker)) rmSync(marker);
        });
      },
    });
    return config;
  },
};

export default nextConfig;
