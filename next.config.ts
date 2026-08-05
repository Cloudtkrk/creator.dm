import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg はネイティブ依存の解決をランタイムに任せる
  serverExternalPackages: ["pg"],
};

export default nextConfig;
