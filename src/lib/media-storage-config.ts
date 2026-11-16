import path from "node:path";

export type MediaStorageConfig = { provider: "local"; directory: string } | { provider: "s3"; region: string; bucket: string; prefix: string };

export function getMediaStorageConfig(env: NodeJS.ProcessEnv = process.env): MediaStorageConfig {
  const provider = env.MEDIA_STORAGE_PROVIDER || "local";
  if (provider === "s3") {
    const region = env.S3_MEDIA_REGION || "";
    const bucket = env.S3_MEDIA_BUCKET || "";
    const prefix = env.S3_MEDIA_PREFIX || "";
    if (!/^[a-z]{2,5}(?:-[a-z]+){1,3}-\d+$/.test(region)) throw new Error("S3 storage requires a valid S3_MEDIA_REGION.");
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || /\.\.|\.-|-\./.test(bucket) || /^\d+\.\d+\.\d+\.\d+$/.test(bucket) || /^(xn--|sthree-|amzn-s3-demo-)|(-s3alias|--ol-s3|--x-s3|--table-s3)$/.test(bucket)) throw new Error("S3 storage requires a valid S3_MEDIA_BUCKET name.");
    if (prefix.length > 200 || !/^(?:[A-Za-z0-9][A-Za-z0-9_-]*\/)+$/.test(prefix)) throw new Error("S3_MEDIA_PREFIX must contain safe path segments and end with / (for example media/).");
    return { provider, region, bucket, prefix };
  }
  if (provider !== "local") throw new Error("MEDIA_STORAGE_PROVIDER must be local or s3.");
  if (env.MEDIA_STORAGE_DIR && !path.isAbsolute(env.MEDIA_STORAGE_DIR)) throw new Error("MEDIA_STORAGE_DIR must be an absolute path.");
  if (env.NODE_ENV === "production" && !env.MEDIA_STORAGE_DIR) throw new Error("Local production storage requires an absolute MEDIA_STORAGE_DIR on persistent shared storage. Use s3 on Amplify.");
  return { provider, directory: env.MEDIA_STORAGE_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), ".media") };
}
