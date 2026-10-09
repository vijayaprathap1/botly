import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Parsers used by knowledge uploads must stay server-side and unbundled.
  // Headless Chromium (demo builder, rendered mode) ships a binary that must not be bundled.
  serverExternalPackages: ["unpdf", "mammoth", "@sparticuz/chromium", "puppeteer-core"],
  // Only the two functions that copy a homepage carry the browser (about 70 MB).
  outputFileTracingIncludes: {
    "/api/admin/demos": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/app/admin/demos": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
  // Knowledge uploads (PDF/DOCX/CSV) go through Server Actions.
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  async redirects() {
    // botly.in is the one public address. The first deployment host and www send people
    // (and search engines) there. The widget script and API stay reachable on the old host:
    // customers' websites already load them from it.
    return [
      { source: "/:path((?!api/|widget\\.js|_next/|auth/).*)", has: [{ type: "host", value: "botly-rosy.vercel.app" }], destination: "https://botly.in/:path", permanent: true },
      { source: "/:path*", has: [{ type: "host", value: "www.botly.in" }], destination: "https://botly.in/:path*", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        // Baseline hardening for every response. The widget runs on client sites via
        // its own script tag (not an iframe), so framing can be denied everywhere.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
      {
        // The embed script: cacheable, fetched cross-origin from client sites.
        source: "/widget.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=300, stale-while-revalidate=86400" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
      {
        source: "/t/:token*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
    ];
  },
};

export default nextConfig;
