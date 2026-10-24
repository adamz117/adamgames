import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The finish route loads the game's sim and the real-course data from public/ at run time,
  // so the serverless function has to carry them.
  outputFileTracingIncludes: {
    '/api/mp/finish': ['./public/games/nine-holes/game.js', './public/games/nine-holes/courses/**/*.json'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
