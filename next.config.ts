import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: {
    incomingRequests: { ignore: [/\/api\/social\/oauth\//, /\/app\/social(?:[/?]|$)/] },
  },
  async headers() {
    return [{ source: "/app/social", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] }];
  },
  outputFileTracingIncludes: {
    "/*": ["./node_modules/ffmpeg-static/ffmpeg", "./node_modules/ffmpeg-static/ffmpeg.exe"],
  },
};

export default nextConfig;
