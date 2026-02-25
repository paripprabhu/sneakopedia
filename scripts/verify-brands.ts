/**
 * Quick post-audit verification — sample each brand and check for lingering prefix issues
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import mongoose from 'mongoose';

config({ path: resolve(process.cwd(), '.env.local') });
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error('MONGODB_URI not set in .env.local');

async function verify() {
  await mongoose.connect(MONGODB_URI!);
  const col = mongoose.connection.db!.collection('sneakers');

  // 1. Find any shoes still with "BRAND |" or "BRAND {" prefix in name
  const stillHasPrefix = await col.find({
    shoeName: { $regex: /^[A-Za-z\s\-\.]+\s*[|{]/ }
  }).toArray();

  // 2. Find any shoes where brand field looks wrong (contains | or multiple words suspiciously)
  const weirdBrand = await col.find({
    brand: { $regex: /[|{<>]/ }
  }).toArray();

  // 3. Brand distribution — count per brand
  const brandCounts = await col.aggregate([
    { $group: { _id: '$brand', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();

  console.log('\n=== BRAND DISTRIBUTION ===');
  brandCounts.forEach(b => console.log(`  ${b._id}: ${b.count}`));

  console.log(`\n=== SHOES STILL WITH PREFIX IN NAME (should be 0) ===`);
  if (stillHasPrefix.length === 0) {
    console.log('  ✓ None found.');
  } else {
    stillHasPrefix.slice(0, 20).forEach(d => console.log(`  [${d.brand}] ${d.shoeName}`));
    if (stillHasPrefix.length > 20) console.log(`  ...and ${stillHasPrefix.length - 20} more`);
  }

  console.log(`\n=== WEIRD BRAND FIELDS (should be 0) ===`);
  if (weirdBrand.length === 0) {
    console.log('  ✓ None found.');
  } else {
    weirdBrand.forEach(d => console.log(`  brand: "${d.brand}" | name: ${d.shoeName}`));
  }

  await mongoose.disconnect();
}

verify().catch(err => { console.error(err); process.exit(1); });
