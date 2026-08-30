import mongoose from "mongoose";

type MongooseCache = { connection: typeof mongoose | null; promise: Promise<typeof mongoose> | null };

const globalWithMongoose = global as typeof globalThis & { mongoose?: MongooseCache };
const cache = globalWithMongoose.mongoose ?? { connection: null, promise: null };
globalWithMongoose.mongoose = cache;

export async function connectToDatabase() {
  if (cache.connection) return cache.connection;
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not configured.");
  cache.promise ??= mongoose.connect(mongoUri, { bufferCommands: false });
  cache.connection = await cache.promise;
  return cache.connection;
}