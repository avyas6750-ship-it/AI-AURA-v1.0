import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Allow the preview URL hostname so Next.js dev server doesn't 404
  // when the gateway proxies external requests with a different Host header.
  allowedDevOrigins: [
    "preview-ws-9d4dd475-68ae-4c1c-9395-e50cb6c7fad2.space-z.ai",
    "preview-9d4dd475-68ae-4c1c-9395-e50cb6c7fad2.space-z.ai",
    "*.space-z.ai",
    "127.0.0.1",
    "localhost",
    "21.0.18.238",
    "*.onrender.com",
    "*.vercel.app",
  ],
  // On Vercel, /py/* requests are routed to the Python serverless function
  // via the `routes` config in vercel.json — no Next.js rewrite needed.
  // In local dev, the rewrite below forwards /py/* to localhost:8000 (FastAPI).
  async rewrites() {
    // On Vercel production, /py/* is handled by the Python function via vercel.json routes.
    // This rewrite only runs in dev mode (when BACKEND_URL is set to localhost).
    const backend = process.env.BACKEND_URL || "http://127.0.0.1:8000";
    return process.env.VERCEL_ENV ? [] : [
      {
        source: "/py/:path*",
        destination: `${backend}/py/:path*`,
      },
    ];
  },
};

export default nextConfig;
