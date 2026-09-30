import type { NextConfig } from 'next';

const repo = 'design-vault';
const isGithubPagesBuild = process.env.GITHUB_ACTIONS === 'true';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: isGithubPagesBuild ? `/${repo}` : '',
};

export default nextConfig;
