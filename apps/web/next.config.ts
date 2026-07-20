import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@aviator/shared', 'pixi.js'],
  output: 'standalone',
  // Monorepo root so standalone includes traced node_modules correctly
  outputFileTracingRoot: path.join(__dirname, '../..'),
  webpack: (config) => {
    // Pixi prefers browser builds
    config.resolve.alias = {
      ...config.resolve.alias,
      'pixi.js': require.resolve('pixi.js'),
    };
    return config;
  },
};

export default nextConfig;
