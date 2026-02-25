import { NextResponse } from 'next/server';
import connectDB from '@/app/lib/mongodb';
import Sneaker from '@/app/lib/models/Sneaker';

// Escape regex special chars to prevent ReDoS attacks
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Whitelist of valid sort values
const VALID_SORTS = new Set(['none', 'price-asc', 'price-desc', 'name-asc', 'name-desc']);

// Max query timeout (ms) — kills slow queries before they block the pool
const QUERY_TIMEOUT_MS = 8000;

// Search aliases — built once at module level, never rebuilt per-request
const SEARCH_ALIASES: Record<string, string[]> = {
  // Jordan series
  'aj1':          ['air jordan 1', 'jordan 1'],
  'aj 1':         ['air jordan 1', 'jordan 1'],
  'aj2':          ['air jordan 2', 'jordan 2'],
  'aj3':          ['air jordan 3', 'jordan 3'],
  'aj4':          ['air jordan 4', 'jordan 4'],
  'aj 4':         ['air jordan 4', 'jordan 4'],
  'aj5':          ['air jordan 5', 'jordan 5'],
  'aj6':          ['air jordan 6', 'jordan 6'],
  'aj11':         ['air jordan 11', 'jordan 11'],
  'aj 11':        ['air jordan 11', 'jordan 11'],
  'aj12':         ['air jordan 12', 'jordan 12'],
  'aj13':         ['air jordan 13', 'jordan 13'],
  'j1':           ['jordan 1'],
  'j4':           ['jordan 4'],
  'j11':          ['jordan 11'],
  'jordans':      ['jordan'],
  // Nike — Air Force
  'af1':          ['air force 1', 'air force one'],
  'af-1':         ['air force 1'],
  'force 1':      ['air force 1'],
  // Nike — Air Max
  'am1':          ['air max 1'],
  'am90':         ['air max 90'],
  'am95':         ['air max 95'],
  'am97':         ['air max 97'],
  'airmax':       ['air max'],
  'tn':           ['air max plus', 'tuned'],
  // Nike — Dunk / SB
  'sb':           ['sb dunk', 'dunk'],
  'sb dunk':      ['dunk'],
  // Adidas / Yeezy
  'yzy':          ['yeezy'],
  'yz':           ['yeezy'],
  '350':          ['yeezy boost 350'],
  '700':          ['yeezy 700'],
  'foam':         ['yeezy foam'],
  'foam runner':  ['yeezy foam runner'],
  // Brands / collabs
  'ow':           ['off-white', 'off white'],
  'off white':    ['off-white'],
  'nb':           ['new balance'],
  'lv':           ['louis vuitton'],
  'ts':           ['travis scott'],
  'travis':       ['travis scott'],
  'cactus jack':  ['travis scott'],
  'chucks':       ['chuck taylor', 'converse'],
  'chuck':        ['chuck taylor'],
  'dms':          ['dr. martens', 'doc martens'],
  'docs':         ['dr. martens'],
  'on cloud':     ['on running'],
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const query      = (searchParams.get('q') || '').toLowerCase().slice(0, 200); // cap length
    const sort       = searchParams.get('sort') || 'none';
    const rawPage    = parseInt(searchParams.get('page') || '1');
    const limit      = 24;
    const id         = searchParams.get('id');
    const random     = searchParams.get('random');
    const priceMax   = searchParams.get('price') || searchParams.get('maxPrice');
    const rawPriceMin = parseInt(searchParams.get('priceMin') || '0');
    const brandsParam = searchParams.get('brands') || searchParams.get('brand');

    // --- VALIDATE & CLAMP ---
    const page     = Math.max(1, Math.min(isNaN(rawPage) ? 1 : rawPage, 500));
    const priceMin = Math.max(0, isNaN(rawPriceMin) ? 0 : rawPriceMin);
    const validSort = VALID_SORTS.has(sort) ? sort : 'none';

    await connectDB();

    // --- RANDOM MODE ---
    if (random === 'true') {
      const [randomSneaker] = await Sneaker.aggregate([{ $sample: { size: 1 } }])
        .option({ maxTimeMS: QUERY_TIMEOUT_MS });
      return NextResponse.json(randomSneaker ? [randomSneaker] : []);
    }

    // --- ID LOOKUP ---
    if (id) {
      const sneaker = await Sneaker.findById(id).lean().maxTimeMS(QUERY_TIMEOUT_MS);
      return NextResponse.json(sneaker ? [sneaker] : []);
    }

    // --- BUILD MONGO QUERY ---
    const conditions: object[] = [];

    // A. Text search — query + aliases, escape regex to prevent ReDoS
    if (query) {
      const searchTerms = [query, ...(SEARCH_ALIASES[query] ?? [])];
      const orClauses = searchTerms.flatMap((term) => {
        const safe = escapeRegex(term);
        return [
          { shoeName: { $regex: safe, $options: 'i' } },
          { brand:    { $regex: safe, $options: 'i' } },
        ];
      });
      conditions.push({ $or: orClauses });
    }

    // B. Price filter — clamp to sane range
    if (priceMin > 0 || priceMax) {
      const priceFilter: Record<string, number> = {};
      if (priceMin > 0) priceFilter.$gte = priceMin;
      if (priceMax) {
        const parsedMax = parseInt(priceMax);
        if (!isNaN(parsedMax)) priceFilter.$lte = Math.min(parsedMax, 10_000_000);
      }
      conditions.push({ retailPrice: priceFilter });
    }

    // C. Brand filter — escape regex
    if (brandsParam) {
      const brands = brandsParam.split(',').slice(0, 10); // max 10 brands
      const brandClauses = brands.flatMap((b) => {
        const safe = escapeRegex(b.trim());
        return [
          { brand:    { $regex: safe, $options: 'i' } },
          { shoeName: { $regex: safe, $options: 'i' } },
        ];
      });
      conditions.push({ $or: brandClauses });
    }

    const mongoQuery = conditions.length > 0 ? { $and: conditions } : {};

    // --- SORT (validated against whitelist) ---
    let sortObj: Record<string, 1 | -1> = { rand: 1 };
    if (validSort === 'price-asc')  sortObj = { retailPrice:  1 };
    if (validSort === 'price-desc') sortObj = { retailPrice: -1 };
    if (validSort === 'name-asc')   sortObj = { shoeName:     1 };
    if (validSort === 'name-desc')  sortObj = { shoeName:    -1 };

    // --- PAGINATE (with query timeout) ---
    const [totalItems, paginatedData] = await Promise.all([
      Sneaker.countDocuments(mongoQuery).maxTimeMS(QUERY_TIMEOUT_MS),
      Sneaker.find(mongoQuery)
        .sort(sortObj)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .maxTimeMS(QUERY_TIMEOUT_MS),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return NextResponse.json(
      { data: paginatedData, pagination: { totalPages, totalItems, currentPage: page } },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
    );
  } catch (err) {
    console.error('[API /sneakers] Error:', err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
