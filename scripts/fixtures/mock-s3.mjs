import { registerHooks } from "node:module";
import { Readable } from "node:stream";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
if (process.env.MONGO_TEST_DATABASE !== "true" && process.env.MEDIA_STORAGE_UNIT_TEST !== "true") throw new Error("S3 mocks are restricted to isolated tests.");
process.env.MEDIA_STORAGE_PROVIDER = "s3";
process.env.S3_MEDIA_REGION = "sa-east-1";
process.env.S3_MEDIA_BUCKET = "postif-isolated-media-test";
process.env.S3_MEDIA_PREFIX = "media/";
export const objects = new Map();
export const calls = [];
let failure;
export function failS3(operation) { failure = operation; }
S3Client.prototype.send = async function (command) {
  const { Bucket, Key } = command.input;
  calls.push({ operation: command.constructor.name, input: command.input });
  if (failure === command.constructor.name) throw Object.assign(new Error("Sensitive AWS diagnostic must not leave the storage layer"), { name: "AccessDenied" });
  if (Bucket !== process.env.S3_MEDIA_BUCKET) throw new Error("Unexpected test bucket");
  const id = `${Bucket}/${Key}`;
  if (command instanceof PutObjectCommand) {
    if (command.input.ACL) throw new Error("Public ACLs must never be set");
    objects.set(id, Buffer.from(command.input.Body));
    return { ETag: '"isolated-etag"' };
  }
  if (command instanceof GetObjectCommand) {
    const bytes = objects.get(id);
    if (!bytes) throw Object.assign(new Error("Missing test object"), { name: "NoSuchKey" });
    return { Body: { transformToWebStream: () => Readable.toWeb(Readable.from([bytes])) }, ContentLength: bytes.length };
  }
  if (command instanceof DeleteObjectCommand) { objects.delete(id); return {}; }
  throw new Error("Unexpected S3 operation");
};
globalThis.postifTestSignMedia = async (_client, command, options) => {
  if (!(command instanceof GetObjectCommand) || options.expiresIn !== 300) throw new Error("Only short-lived GET downloads may be signed");
  calls.push({ operation: "SignDownload", input: command.input, expiresIn: options.expiresIn });
  return `https://${command.input.Bucket}.s3.sa-east-1.amazonaws.com/${command.input.Key}?X-Amz-Expires=${options.expiresIn}&X-Amz-Signature=isolated-test`;
};
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@aws-sdk/s3-request-presigner") return { url: "data:text/javascript,export const getSignedUrl=(...args)=>globalThis.postifTestSignMedia(...args);", shortCircuit: true };
    return next(specifier, context);
  },
});
