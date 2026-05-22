/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@aiesec/db", "@aiesec/lib", "@aiesec/ui"]
};

export default nextConfig;
