import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "*.space-z.ai",
    "127.0.0.1",
    "localhost",
    "*.onrender.com",
    "*.vercel.app",
  ],
  // Route /py/* requests to the Vercel Python serverless function at /api/py/*
  async rewrites() {
    if (process.env.VERCEL_ENV) {
      return [
        {
          source: "/py/:path*",
          destination: "/api/py/:path*",
        },
      ];
    }
    const backend = process.env.BACKEND_URL || "http://127.0.0.1:8000";
    return [
      {
        source: "/py/:path*",
        destination: `${backend}/py/:path*`,
      },
    ];
  },
};

export default nextConfig;
