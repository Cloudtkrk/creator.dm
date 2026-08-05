import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg はネイティブ依存の解決をランタイムに任せる
  serverExternalPackages: ["pg"],
  experimental: {
    // バックアップからの復元でファイルを受け取るため既定の1MBから引き上げる
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
