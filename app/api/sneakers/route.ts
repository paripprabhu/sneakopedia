import { NextResponse } from 'next/server';
import connectDB from '@/app/lib/mongodb';
import Sneaker from '@/app/lib/models/Sneaker';

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
  const { searchParams } = new URL(request.url);

  const query      = searchParams.get('q')?.toLowerCase() || '';
  const sort       = searchParams.get('sort') || 'none';
  const page       = parseInt(searchParams.get('page') || '1');
  const limit      = 24;
  const id         = searchParams.get('id');
  const random     = searchParams.get('random');
  const priceMax   = searchParams.get('price') || searchParams.get('maxPrice');
  const priceMin   = parseInt(searchParams.get('priceMin') || '0');
  const brandsParam = searchParams.get('brands') || searchParams.get('brand');

  await connectDB();

  // --- RANDOM MODE ---
  if (random === 'true') {
    const [randomSneaker] = await Sneaker.aggregate([{ $sample: { size: 1 } }]);
    return NextResponse.json(randomSneaker ? [randomSneaker] : []);
  }

  // --- ID LOOKUP ---
  if (id) {
    const sneaker = await Sneaker.findById(id).lean();
    return NextResponse.json(sneaker ? [sneaker] : []);
  }

  // --- BUILD MONGO QUERY ---
  const conditions: object[] = [];

  // A. Text search — query + aliases, any term matches shoeName or brand
  if (query) {
    const searchTerms = [query, ...(SEARCH_ALIASES[query] ?? [])];
    const orClauses = searchTerms.flatMap((term) => [
      { shoeName: { $regex: term, $options: 'i' } },
      { brand:    { $regex: term, $options: 'i' } },
    ]);
    conditions.push({ $or: orClauses });
  }

  // B. Price filter
  if (priceMin > 0 || priceMax) {
    const priceFilter: Record<string, number> = {};
    if (priceMin > 0) priceFilter.$gte = priceMin;
    if (priceMax)     priceFilter.$lte = parseInt(priceMax);
    conditions.push({ retailPrice: priceFilter });
  }

  // C. Brand filter
  if (brandsParam) {
    const brands = brandsParam.split(',');
    const brandClauses = brands.flatMap((b) => [
      { brand:    { $regex: b.trim(), $options: 'i' } },
      { shoeName: { $regex: b.trim(), $options: 'i' } },
    ]);
    conditions.push({ $or: brandClauses });
  }

  const mongoQuery = conditions.length > 0 ? { $and: conditions } : {};

  // --- SORT ---
  let sortObj: Record<string, 1 | -1> = { rand: 1 }; // random-ish stable default
  if (sort === 'price-asc')  sortObj = { retailPrice:  1 };
  if (sort === 'price-desc') sortObj = { retailPrice: -1 };
  if (sort === 'name-asc')   sortObj = { shoeName:     1 };
  if (sort === 'name-desc')  sortObj = { shoeName:    -1 };

  // --- PAGINATE ---
  const [totalItems, paginatedData] = await Promise.all([
    Sneaker.countDocuments(mongoQuery),
    Sneaker.find(mongoQuery)
      .sort(sortObj)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  const totalPages = Math.ceil(totalItems / limit);

  return NextResponse.json(
    { data: paginatedData, pagination: { totalPages, totalItems, currentPage: page } },
    { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
  );
}
