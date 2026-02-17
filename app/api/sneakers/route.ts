import { NextResponse } from 'next/server';
import { sneakers } from '@/app/lib/sneakerData'; 

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
  const brandsParam = searchParams.get('brands'); 

  // 2. SPECIAL MODES (Random / ID)
  if (random === 'true') {
    const randomSneaker = sneakers[Math.floor(Math.random() * sneakers.length)];
    return NextResponse.json([randomSneaker]);
  }

  if (id) {
    const specificSneaker = sneakers.find((s) => s._id === id);
    return NextResponse.json(specificSneaker ? [specificSneaker] : []);
  }

  // 3. FILTERING LOGIC
  let filtered = sneakers.filter((sneaker) => {
    // A. Text Search (Matches Name OR Brand)
    const matchesSearch = 
      sneaker.shoeName.toLowerCase().includes(query) || 
      sneaker.brand.toLowerCase().includes(query);

    // B. Price Filter (New)
    // If priceMax exists, check if sneaker price is lower. If not, pass true.
    const matchesPrice = priceMax ? sneaker.retailPrice <= parseInt(priceMax) : true;

    // C. Brand Filter (New)
    let matchesBrand = true;
    if (brandsParam) {
      const selectedBrands = brandsParam.split(','); // "Nike,Adidas" -> ["Nike", "Adidas"]
      
      // Check if the sneaker brand includes ANY of the selected brands
      matchesBrand = selectedBrands.some(b => 
        sneaker.brand.toLowerCase().includes(b.toLowerCase()) ||
        sneaker.shoeName.toLowerCase().includes(b.toLowerCase())
      );
    }

    return matchesSearch && matchesPrice && matchesBrand;
  });

  // 4. SORTING
  if (sort === 'price-asc') filtered.sort((a, b) => a.retailPrice - b.retailPrice);
  if (sort === 'price-desc') filtered.sort((a, b) => b.retailPrice - a.retailPrice);
  if (sort === 'name-asc') filtered.sort((a, b) => a.shoeName.localeCompare(b.shoeName));
  if (sort === 'name-desc') filtered.sort((a, b) => b.shoeName.localeCompare(a.shoeName));

  // 5. PAGINATION
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / limit);
  const startIndex = (page - 1) * limit;
  const paginatedData = filtered.slice(startIndex, startIndex + limit);

  return NextResponse.json({
    data: paginatedData,
    pagination: { totalPages, totalItems, currentPage: page },
  });
}