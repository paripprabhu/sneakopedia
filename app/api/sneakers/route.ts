import { NextResponse } from 'next/server';
import { sneakers } from '@/app/lib/sneakerData';

// Module-level constant — built once, never rebuilt per-request
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

// Deterministic shuffle — same seed always produces same order (for stable pagination)
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    const j = Math.abs(s) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  // 1. GET PARAMETERS FROM URL
  const query = searchParams.get('q')?.toLowerCase() || '';
  const sort = searchParams.get('sort') || 'none';
  const page = parseInt(searchParams.get('page') || '1');
  const limit = 24;
  
  const id = searchParams.get('id');
  const random = searchParams.get('random');
  
  // --- NEW: GRAB THE FILTERS ---
  const priceMax = searchParams.get('price');
  const priceMin = parseInt(searchParams.get('priceMin') || '0');
  const brandsParam = searchParams.get('brands');
  const seed = parseInt(searchParams.get('seed') || '0');

  // 2. SPECIAL MODES (Random / ID)
  if (random === 'true') {
    const randomSneaker = sneakers[Math.floor(Math.random() * sneakers.length)];
    return NextResponse.json([randomSneaker]);
  }

  if (id) {
    const specificSneaker = sneakers.find((s) => s._id === id);
    return NextResponse.json(specificSneaker ? [specificSneaker] : []);
  }

  // 3. SEARCH ALIAS EXPANSION — uses module-level SEARCH_ALIASES constant
  const searchTerms: string[] = query ? [query, ...(SEARCH_ALIASES[query] ?? [])] : [];

  // Hoist computed values out of the filter loop (avoid re-computing per sneaker)
  const priceMaxInt = priceMax ? parseInt(priceMax) : null;
  const brandsArr = brandsParam ? brandsParam.split(',') : null;

  // 4. FILTERING LOGIC
  let filtered = sneakers.filter((sneaker) => {
    // A. Text Search — matches name or brand against any expanded search term
    const matchesSearch =
      searchTerms.length === 0 ||
      searchTerms.some(term =>
        sneaker.shoeName.toLowerCase().includes(term) ||
        sneaker.brand.toLowerCase().includes(term)
      );

    // B. Price Filter — min and max bucket support
    const matchesPrice =
      sneaker.retailPrice >= priceMin &&
      (priceMaxInt !== null ? sneaker.retailPrice <= priceMaxInt : true);

    // C. Brand Filter
    const matchesBrand =
      brandsArr === null ||
      brandsArr.some(b =>
        sneaker.brand.toLowerCase().includes(b.toLowerCase()) ||
        sneaker.shoeName.toLowerCase().includes(b.toLowerCase())
      );

    return matchesSearch && matchesPrice && matchesBrand;
  });

  // 5. SORTING — shuffle with session seed when no explicit sort is chosen
  if (sort === 'price-asc') filtered.sort((a, b) => a.retailPrice - b.retailPrice);
  else if (sort === 'price-desc') filtered.sort((a, b) => b.retailPrice - a.retailPrice);
  else if (sort === 'name-asc') filtered.sort((a, b) => a.shoeName.localeCompare(b.shoeName));
  else if (sort === 'name-desc') filtered.sort((a, b) => b.shoeName.localeCompare(a.shoeName));
  else if (seed) filtered = seededShuffle(filtered, seed);

  // 6. PAGINATION
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / limit);
  const startIndex = (page - 1) * limit;
  const paginatedData = filtered.slice(startIndex, startIndex + limit);

  return NextResponse.json(
    { data: paginatedData, pagination: { totalPages, totalItems, currentPage: page } },
    { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
  );
}