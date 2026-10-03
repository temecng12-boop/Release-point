import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Pitch imports (importPitchMetrics) send the whole file's rows in one
      // action call. Default is 1mb; Vercel's function body limit is 4.5 MB.
      // Keep in sync with IMPORT_BODY_LIMIT_BYTES in src/lib/pitch-import.ts.
      bodySizeLimit: '4mb',
    },
  },
  async headers() {
    return [
      {
        // COEP only on dashboard — required for FFmpeg.wasm (SharedArrayBuffer).
        // Applying it globally blocks cross-origin iframes (YouTube embeds on /clips/compare).
        source: '/dashboard(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },
}

export default nextConfig;
