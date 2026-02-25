/**
 * Full database brand audit
 * Detects and fixes:
 *  1. Shoes where "BRAND | NAME" prefix in shoeName doesn't match stored brand
 *  2. Shoes where stored brand doesn't match any known brand (likely scraper error)
 * Run: npx tsx scripts/audit-brands.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import mongoose from 'mongoose';

config({ path: resolve(process.cwd(), '.env.local') });
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error('MONGODB_URI not set in .env.local');

// Canonical brand names + all aliases that could appear as a prefix in shoeName
const BRAND_ALIASES: Record<string, string[]> = {
  'Nike':           ['nike'],
  'Jordan':         ['jordan', 'air jordan'],
  'Adidas':         ['adidas', 'adidas originals', 'adidas sport'],
  'Yeezy':          ['yeezy', 'adidas yeezy'],
  'New Balance':    ['new balance', 'nb'],
  'ASICS':          ['asics', 'asics tiger'],
  'Puma':           ['puma'],
  'Reebok':         ['reebok', 'reebok classics'],
  'Converse':       ['converse', 'converse chuck taylor', 'chuck taylor'],
  'Vans':           ['vans', 'vans vault'],
  'HOKA':           ['hoka', 'hoka one one'],
  'On Running':     ['on', 'on running', 'on cloud'],
  'Salomon':        ['salomon'],
  'BAPE':           ['bape', 'a bathing ape'],
  'Balenciaga':     ['balenciaga'],
  'Off-White':      ['off-white', 'off white'],
  'Rick Owens':     ['rick owens', 'rick owens drkshdw'],
  'Louis Vuitton':  ['louis vuitton', 'lv'],
  'Dior':           ['dior', 'christian dior'],
  'Fear of God':    ['fear of god', 'fog'],
  'Essentials':     ['essentials', 'fear of god essentials'],
  'Represent':      ['represent'],
  'MSCHF':          ['mschf'],
  'Golden Goose':   ['golden goose', 'ggdb', 'golden goose deluxe brand'],
  'Maison Mihara Yasuhiro': ['maison mihara', 'mihara yasuhiro', 'mmy'],
  'Axel Arigato':   ['axel arigato'],
  'UGG':            ['ugg'],
  'Fila':           ['fila'],
  'Under Armour':   ['under armour', 'ua'],
  'Skechers':       ['skechers'],
  'Birkenstock':    ['birkenstock'],
  'Timberland':     ['timberland'],
  'Dr. Martens':    ['dr. martens', 'dr martens', 'doc martens'],
  'Saucony':        ['saucony'],
  'Mizuno':         ['mizuno'],
  'Li-Ning':        ['li-ning', 'li ning', 'lining'],
  'Anta':           ['anta'],
  'Crocs':          ['crocs'],
  'Supreme':        ['supreme'],
  'Palace':         ['palace'],
  'Stussy':         ['stussy'],
  'Travis Scott':   ['travis scott', 'cactus jack'],
  'Brooks':         ['brooks'],
  'Columbia':       ['columbia'],
  'Merrell':        ['merrell'],
  'Comet':          ['comet', 'wear comet'],
  'Thaely':         ['thaely'],
  'Gully Labs':     ['gully labs'],
  '7-10':           ['7-10', '7 10'],
  'Bacca Bucci':    ['bacca bucci'],
  'New Era':        ['new era'],
  'Clarks':         ['clarks'],
  'Lacoste':        ['lacoste'],
  'Hugo Boss':      ['hugo boss', 'boss'],
  'Polo Ralph Lauren': ['polo ralph lauren', 'polo', 'ralph lauren'],
  'Tommy Hilfiger': ['tommy hilfiger', 'tommy'],
  'Emporio Armani': ['emporio armani', 'armani'],
  'Guess':          ['guess'],
};

// Build reverse lookup: lowercase alias → canonical name
const aliasToCanonical: Record<string, string> = {};
for (const [canonical, aliases] of Object.entries(BRAND_ALIASES)) {
  for (const alias of aliases) {
    aliasToCanonical[alias.toLowerCase()] = canonical;
  }
}

// Extract brand prefix from shoeName patterns like:
//   "Nike | AIR FORCE 1 { WHITE"
//   "Adidas | SAMBA OG 'WHITE/BLACK'"
//   "REEBOK | CLASSIC LEATHER { BEIGE"
function extractPrefixBrand(shoeName: string): string | null {
  const pipeMatch = shoeName.match(/^([^|{'"]+?)\s*[|{]/);
  if (pipeMatch) {
    const prefix = pipeMatch[1].trim().toLowerCase();
    // Try full prefix first, then progressively shorter
    if (aliasToCanonical[prefix]) return aliasToCanonical[prefix];
    // Try just first word
    const firstWord = prefix.split(/\s+/)[0];
    if (aliasToCanonical[firstWord]) return aliasToCanonical[firstWord];
  }
  return null;
}

// Normalise stored brand to canonical
function normaliseStoredBrand(brand: string): string {
  const lower = brand.toLowerCase().trim();
  if (aliasToCanonical[lower]) return aliasToCanonical[lower];
  // Try first word only
  const first = lower.split(/\s+/)[0];
  if (aliasToCanonical[first]) return aliasToCanonical[first];
  return brand; // unknown — return as-is
}

async function audit() {
  await mongoose.connect(MONGODB_URI!);
  console.log('Connected. Loading all sneakers...\n');

  const col = mongoose.connection.db!.collection('sneakers');
  const total = await col.countDocuments();
  console.log(`Total documents: ${total}\n`);

  const all = await col.find({}).toArray();

  const fixes: { _id: any; oldBrand: string; newBrand: string; oldName: string; newName: string }[] = [];

  for (const doc of all) {
    const storedBrand    = (doc.brand || '').trim();
    const storedName     = (doc.shoeName || '').trim();
    const prefixBrand    = extractPrefixBrand(storedName);
    const normStored     = normaliseStoredBrand(storedBrand);

    let newBrand = storedBrand;
    let newName  = storedName;
    let changed  = false;

    // Case 1: prefix brand extracted and it differs from stored brand
    if (prefixBrand && prefixBrand !== normStored) {
      newBrand = prefixBrand;
      changed  = true;
    }

    // Case 2: shoeName has "BRAND |" prefix — strip it regardless of brand match
    const pipeMatch = storedName.match(/^[^|{'"]+?\s*[|{]\s*/);
    if (pipeMatch) {
      newName = storedName.slice(pipeMatch[0].length).trim();
      changed = true;
    }

    // If stored brand itself contains the format issue (e.g. "Nike | Reebok")
    if (storedBrand.includes('|')) {
      const parts = storedBrand.split('|');
      newBrand = parts[parts.length - 1].trim();
      changed = true;
    }

    if (changed) {
      fixes.push({ _id: doc._id, oldBrand: storedBrand, newBrand, oldName: storedName, newName });
    }
  }

  if (fixes.length === 0) {
    console.log('✓ No mislabelled shoes found. Database looks clean.\n');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${fixes.length} shoes needing correction:\n`);
  fixes.forEach(f => {
    const brandChanged = f.oldBrand !== f.newBrand;
    const nameChanged  = f.oldName  !== f.newName;
    if (brandChanged) console.log(`  BRAND: "${f.oldBrand}" → "${f.newBrand}"`);
    if (nameChanged)  console.log(`  NAME:  "${f.oldName}" → "${f.newName}"`);
    console.log();
  });

  // Apply all fixes
  console.log('Applying fixes...\n');
  let updated = 0;
  for (const f of fixes) {
    await col.updateOne(
      { _id: f._id },
      { $set: { brand: f.newBrand, shoeName: f.newName } }
    );
    updated++;
  }

  console.log(`✓ Fixed ${updated} documents.`);
  await mongoose.disconnect();
}

audit().catch(err => { console.error(err); process.exit(1); });
