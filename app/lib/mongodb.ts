import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI!;

if (!MONGODB_URI) {
  throw new Error('Please define MONGODB_URI in .env.local');
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var _mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global._mongooseCache ?? { conn: null, promise: null };
global._mongooseCache = cached;

export default async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      maxPoolSize: 50,           // handle high concurrency (default is 10)
      minPoolSize: 5,            // keep warm connections ready
      serverSelectionTimeoutMS: 10000,  // fail fast if Atlas is unreachable
      socketTimeoutMS: 30000,    // kill hung sockets after 30s
      connectTimeoutMS: 15000,   // connection attempt timeout
    }).catch((err) => {
      // Reset promise so next request retries instead of returning stale rejection
      cached.promise = null;
      throw err;
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
