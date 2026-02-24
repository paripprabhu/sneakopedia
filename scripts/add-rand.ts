/**
 * One-time script: stamp a rand float [0,1] on every sneaker doc that lacks one.
 * Run: npx tsx scripts/add-rand.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import mongoose from 'mongoose';

config({ path: resolve(process.cwd(), '.env.local') });

async function run() {
  console.log('Connecting...');
  await mongoose.connect(process.env.MONGODB_URI!);
  const col = mongoose.connection.collection('sneakers');

  const result = await col.updateMany(
    { rand: { $exists: false } },
    [{ $set: { rand: { $rand: {} } } }]
  );
  console.log(`✅ Stamped rand on ${result.modifiedCount} docs`);

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
