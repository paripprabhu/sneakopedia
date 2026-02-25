/**
 * One-off fix: all shoes with "Reebok" in the name but wrong brand
 * Run: npx tsx scripts/fix-reebok-campio.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import mongoose from 'mongoose';

config({ path: resolve(process.cwd(), '.env.local') });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error('MONGODB_URI not set in .env.local');

async function fix() {
  await mongoose.connect(MONGODB_URI!);
  console.log('Connected.\n');

  const col = mongoose.connection.db!.collection('sneakers');

  // Find ALL shoes where "Reebok" appears in the name (catches all colorways)
  const docs = await col.find({ shoeName: { $regex: /reebok/i } }).toArray();

  console.log(`Found ${docs.length} shoe(s) with "Reebok" in the name:\n`);
  docs.forEach(d => console.log(`  [${d.brand}] ${d.shoeName} — ₹${d.retailPrice}`));

  let fixed = 0;
  for (const doc of docs) {
    const cleanName = doc.shoeName
      .replace(/^reebok\s*[|{]\s*/i, '')
      .trim();

    await col.updateOne(
      { _id: doc._id },
      { $set: { brand: 'Reebok', shoeName: cleanName } }
    );

    console.log(`\nFixed: "${doc.shoeName}" (was: ${doc.brand})`);
    console.log(`    → brand: Reebok, shoeName: "${cleanName}"`);
    fixed++;
  }

  console.log(`\n${fixed} document(s) updated.`);
  await mongoose.disconnect();
}

fix().catch((err) => { console.error(err); process.exit(1); });
