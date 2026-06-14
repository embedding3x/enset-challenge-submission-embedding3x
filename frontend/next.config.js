/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required by the Docker/k8s image: the runner stage copies .next/standalone.
  output: 'standalone',
};

module.exports = nextConfig;
