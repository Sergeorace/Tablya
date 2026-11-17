/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: 'localhost' },
    ],
  },
};

module.exports = nextConfig;
