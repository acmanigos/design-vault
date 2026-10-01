import type { NextConfig } from 'next';

const repo = 'design-vault';
const isGithubPagesBuild = process.env.GITHUB_ACTIONS === 'true';

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  experimental: { webpackBuildWorker: false, cpus: 1 },
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: isGithubPagesBuild ? `/${repo}` : '',
};

export default nextConfig;

