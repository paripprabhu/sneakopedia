/**
 * Migration script: sneakerData.js → MongoDB Atlas
 * Run: npx tsx scripts/migrate.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import mongoose from 'mongoose';

config({ path: resolve(process.cwd(), '.env.local') });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error('MONGODB_URI not set in .env.local');

async function migrate() {
  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(MONGODB_URI!);
  console.log('Connected.\n');

  const { sneakers } = await import('../app/lib/sneakerData.js');
  console.log(`Found ${sneakers.length} sneakers in sneakerData.js`);

  const collection = mongoose.connection.collection('sneakers');

  // Drop existing data
  await collection.drop().catch(() => console.log('Collection empty, starting fresh.'));

  // Bulk insert with upsert — safe to re-run
  const ops = (sneakers as any[]).map((s) => ({
    replaceOne: {
      filter: { _id: s._id },
      replacement: {
        _id:         s._id,
        shoeName:    s.shoeName    ?? '',
        brand:       s.brand       ?? '',
        retailPrice: s.retailPrice ?? 0,
        currency:    s.currency    ?? 'INR',
        thumbnail:   s.thumbnail   ?? '',
        description: s.description ?? '',
        url:         s.url         ?? '',
      },
      upsert: true,
    },
  }));

  console.log('Inserting sneakers...');
  const result = await collection.bulkWrite(ops, { ordered: false });
  console.log(`✅ Inserted: ${result.upsertedCount} | Updated: ${result.modifiedCount}`);

  // Create indexes for fast queries
  console.log('Creating indexes...');
  await collection.createIndex({ brand: 1 });
  await collection.createIndex({ retailPrice: 1 });
  await collection.createIndex({ shoeName: 1 });
  console.log('✅ Indexes ready.');

  await mongoose.disconnect();
  console.log('\nMigration complete!');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
