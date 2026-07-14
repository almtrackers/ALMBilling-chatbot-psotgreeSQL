
import type {NextConfig} from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    // This project lives under Downloads/...; a parent package-lock.json was confusing Turbopack.
    root: path.join(__dirname),
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  webpack: (config, context) => {
    if (context.isServer) {
      const existing = config.externals ?? [];
      config.externals = Array.isArray(existing) ? [...existing, '@napi-rs/canvas'] : existing;
    }
    return config;
  },
};

export default nextConfig;
