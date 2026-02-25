/**
 * Fix brand field capitalisation inconsistencies
 * Run: npx tsx scripts/fix-brand-casing.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import mongoose from 'mongoose';

config({ path: resolve(process.cwd(), '.env.local') });
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error('MONGODB_URI not set in .env.local');

// Map every known bad variant → correct canonical name
const CORRECTIONS: Record<string, string> = {
  // Lowercase/wrong case brands
  'nike':                   'Nike',
  'jordan':                 'Jordan',
  'adidas':                 'Adidas',
  'adidas originals':       'Adidas',
  'adidas sport':           'Adidas',
  'yeezy':                  'Yeezy',
  'new balance':            'New Balance',
  'asics':                  'ASICS',
  'asics tiger':            'ASICS',
  'puma':                   'Puma',
  'reebok':                 'Reebok',
  'converse':               'Converse',
  'vans':                   'Vans',
  'hoka':                   'HOKA',
  'hoka one one':           'HOKA',
  'on running':             'On Running',
  'on cloud':               'On Running',
  'on cloud ':              'On Running',   // trailing space variant
  'on':                     'On Running',
  'salomon':                'Salomon',
  'bape':                   'BAPE',
  'balenciaga':             'Balenciaga',
  'off-white':              'Off-White',
  'off white':              'Off-White',
  'rick owens':             'Rick Owens',
  'louis vuitton':          'Louis Vuitton',
  'dior':                   'Dior',
  'fear of god':            'Fear of God',
  'essentials':             'Essentials',
  'represent':              'Represent',
  'mschf':                  'MSCHF',
  'golden goose':           'Golden Goose',
  'maison mihara':          'Maison Mihara Yasuhiro',
  'axel arigato':           'Axel Arigato',
  'ugg':                    'UGG',
  'fila':                   'Fila',
  'under armour':           'Under Armour',
  'skechers':               'Skechers',
  'birkenstock':            'Birkenstock',
  'timberland':             'Timberland',
  'dr. martens':            'Dr. Martens',
  'dr martens':             'Dr. Martens',
  'saucony':                'Saucony',
  'mizuno':                 'Mizuno',
  'li-ning':                'Li-Ning',
  'li ning':                'Li-Ning',
  'anta':                   'Anta',
  'crocs':                  'Crocs',
  'supreme':                'Supreme',
  'palace':                 'Palace',
  'stussy':                 'Stussy',
  'travis scott':           'Travis Scott',
  'brooks':                 'Brooks Running',
  'brooks running':         'Brooks Running',
  'columbia':               'Columbia',
  'merrell':                'Merrell',
  'amiri':                  'Amiri',
  'christian louboutin':    'Christian Louboutin',
  'onitsuka tiger':         'Onitsuka Tiger',
  'naked wolfe':            'Naked Wolfe',
  'new era':                'New Era',
  'clarks':                 'Clarks',
  'lacoste':                'Lacoste',
  'streetwear':             'Streetwear',
};

async function fixCasing() {
  await mongoose.connect(MONGODB_URI!);
  console.log('Connected.\n');

  const col = mongoose.connection.db!.collection('sneakers');
  let fixed = 0;

  for (const [wrong, correct] of Object.entries(CORRECTIONS)) {
    // Case-insensitive exact match on brand field (after trimming)
    const result = await col.updateMany(
      { brand: { $regex: `^${wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, $options: 'i' } },
      [{ $set: { brand: correct } }]
    );
    if (result.modifiedCount > 0) {
      console.log(`  "${wrong}" → "${correct}"  (${result.modifiedCount} shoes)`);
      fixed += result.modifiedCount;
    }
  }

  // Also fix "On Cloud" capitalisation variants to "On Running"
  const onVariants = await col.updateMany(
    { brand: { $regex: /^on\s+cloud/i } },
    [{ $set: { brand: 'On Running' } }]
  );
  if (onVariants.modifiedCount > 0) {
    console.log(`  "On Cloud/*" → "On Running"  (${onVariants.modifiedCount} shoes)`);
    fixed += onVariants.modifiedCount;
  }

  console.log(`\n✓ Total fixed: ${fixed} documents.`);

  // Final brand distribution
  const brandCounts = await col.aggregate([
    { $group: { _id: '$brand', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();

  console.log('\n=== FINAL BRAND DISTRIBUTION ===');
  brandCounts.forEach(b => console.log(`  ${b._id}: ${b.count}`));

  await mongoose.disconnect();
}

fixCasing().catch(err => { console.error(err); process.exit(1); });
