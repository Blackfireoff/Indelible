/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  output: 'standalone', // Required for Docker - outputs self-contained Node.js server
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding')
    return config
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
