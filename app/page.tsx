"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================================
// MODULE-LEVEL CONSTANTS & PURE FUNCTIONS
// Defined once at module load — never recreated on re-render
// ============================================================================

const ALL_BRANDS = [
  "Jordan", "Yeezy", "Nike", "Adidas", "New Balance",
  "Asics", "Crocs", "On Running", "Comet", "Gully Labs",
  "7-10", "Hoka", "Salomon", "Vans", "UGG", "Fila",
  "Puma", "Louis Vuitton", "Dior", "Bape", "Li-Ning",
  "Anta", "Reebok", "Converse", "Under Armour", "Skechers",
  "Rick Owens", "Off-White", "Balenciaga", "Birkenstock",
  "Timberland", "Dr. Martens", "Saucony", "Mizuno",
  "Fear of God", "Essentials", "Represent", "Axel Arigato",
  "Golden Goose", "Maison Mihara", "MSCHF", "Supreme",
  "Palace", "Stussy", "Travis Scott", "OVO", "Nocta",
];

const PRICE_BUCKETS = [
  { label: 'ALL',          min: 0,     max: 300000 },
  { label: 'UNDER ₹5K',   min: 0,     max: 5000   },
  { label: '₹5K – 15K',   min: 5000,  max: 15000  },
  { label: '₹15K – 50K',  min: 15000, max: 50000  },
  { label: '₹50K+',       min: 50000, max: 300000 },
];

const THEME_HEX: Record<string, string> = {
  blue:    '#3b82f6',
  emerald: '#10b981',
  amber:   '#f59e0b',
  rose:    '#f43f5e',
};

// Single formatter instance — Intl.NumberFormat is expensive to construct
const INR_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const formatPrice = (price: number) => INR_FORMATTER.format(price);

const getFallbackLogo = (brand: string) => {
  const b = brand ? brand.toLowerCase() : '';
  if (b.includes('on running') || b.includes('on cloud')) return '/oncloudlogo.png';
  if (b.includes('bacca') || b.includes('bucci')) return '/baccabuccilogo.jpg';
  if (b.includes('comet')) return '/cometlogo.png';
  if (b.includes('gully')) return '/gullylabslogo.png';
  if (b.includes('thaely')) return '/thaelylogo.jpeg';
  if (b.includes('hoka')) return '/hokalogo.png';
  if (b.includes('bape') || b.includes('bathing')) return '/bapelogo.png';
  if (b.includes('mschf')) return '/mschflogo.png';
  if (b.includes('off-white') || b.includes('off white')) return '/offwhitelogo.png';
  if (b.includes('rick owens')) return '/rickowenslogo.png';
  if (b.includes('bluorng')) return '/bluornglogo.jpeg';
  return '/file.svg';
};

const getSafeImage = (sneaker: any) => {
  const url = sneaker.thumbnail;
  const brand = sneaker.brand;
  if (!url || url === "") return getFallbackLogo(brand);
  if (url.includes('crepdogcrew') || url.includes('cdn.shopify.com')) {
    return `https://wsrv.nl/?url=${encodeURIComponent(url)}`;
  }
  return url;
};

const getLinks = (sneakerName: string, brand: string) => {
  const cleanName = sneakerName.replace(/[|{}<>]/g, ' ').replace(/\s+/g, ' ').trim();
  const baseQuery  = encodeURIComponent(cleanName);
  const b = brand ? brand.toLowerCase() : '';

  // Domestic D2C brands — search by name only (no size; their search doesn't support it)
  if (b.includes('comet')) {
    return { desi: [{ name: "Comet Official", url: `https://www.wearcomet.com/search?q=${baseQuery}` }], global: [] };
  }
  if (b.includes('thaely')) {
    return { desi: [{ name: "Thaely Official", url: `https://thaely.com/search?q=${baseQuery}` }], global: [] };
  }
  if (b.includes('gully') || b.includes('gully labs')) {
    return { desi: [{ name: "Gully Labs", url: `https://www.gullylabs.com/search?q=${baseQuery}` }], global: [] };
  }
  if (b.includes('7-10') || b.includes('7 10')) {
    return { desi: [{ name: "7-10 Official", url: `https://www.7-10.in/search?q=${baseQuery}` }], global: [] };
  }
  if (b.includes('bacca') || b.includes('bucci')) {
    return { desi: [{ name: "Bacca Bucci", url: `https://baccabucci.com/search?q=${baseQuery}` }], global: [] };
  }

  return {
    desi: [
      { name: "Mainstreet",   url: `https://marketplace.mainstreet.co.in/search?q=${baseQuery}` },
      { name: "VegNonVeg",    url: `https://www.vegnonveg.com/search?q=${baseQuery}` },
      { name: "LTD Edition",  url: `https://limitededt.in/search?q=${baseQuery}` },
      { name: "Superkicks",   url: `https://www.superkicks.in/search?q=${baseQuery}` },
      { name: "Crepdog Crew", url: `https://crepdogcrew.com/search?q=${baseQuery}` },
    ],
    global: [
      // Size params removed — retailer search pages don't support them and return wrong/empty results
      { name: "StockX", url: `https://stockx.com/search?s=${baseQuery}` },
      { name: "GOAT",   url: `https://www.goat.com/search?query=${baseQuery}` },
    ],
  };
};

// ============================================================================
// MAIN APP
// ============================================================================
export default function Sneakopedia() {
  // --- STATE MANAGEMENT ---
  const [searchInput, setSearchInput] = useState('');     
  const [debouncedSearch, setDebouncedSearch] = useState(''); 
  const [sortType, setSortType] = useState('none');
  const [currentPage, setCurrentPage] = useState(1);
  
  // Data State
  const [sneakers, setSneakers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Autocomplete
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Grid density: 3 | 4 | 5 columns
  const [gridDensity, setGridDensity] = useState<3 | 4 | 5>(5);
  
  const [selectedSneaker, setSelectedSneaker] = useState<any>(null);
  const [recentViewed, setRecentViewed] = useState<any[]>([]);

  // Filter State
  const [showFilters, setShowFilters] = useState(false);
  const [showGrails, setShowGrails] = useState(false);
  const [priceRange, setPriceRange] = useState(300000);
  const [priceMin, setPriceMin] = useState(0);
  const [activeBucket, setActiveBucket] = useState('ALL');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  // Grail Data State
  const [grails, setGrails] = useState<any[]>([]);


  // Theme State
  const [theme, setTheme] = useState('blue');

  // Session seed — new random value on every page load, stable across pagination
  const [sessionSeed] = useState(() => Math.floor(Math.random() * 9999999));

  // My Size preference (US size, persisted)
  const [mySize, setMySize] = useState<string>('');

  // Responsive mobile detection
  const [isMobile, setIsMobile] = useState(false);
  const [atBottom, setAtBottom] = useState(false);

  // --- GRAIL LOGIC ---
  const toggleGrail = (sneaker: any) => {
    let newGrails;
    const exists = grails.find(g => g._id === sneaker._id);
    
    if (exists) {
      // Remove
      newGrails = grails.filter(g => g._id !== sneaker._id);
    } else {
      // Add
      newGrails = [sneaker, ...grails];
    }
    
    setGrails(newGrails);
    localStorage.setItem('sneakopedia_grails', JSON.stringify(newGrails));
  };

  // --- THEME LOGIC ---
  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    localStorage.setItem('sneakopedia_theme', newTheme);
  };

  const hex = THEME_HEX[theme] ?? '#3b82f6';
  const activeFilterCount = selectedBrands.length + (activeBucket !== 'ALL' ? 1 : 0);



  // --- FEATURE: GENERATE RECEIPT ---
  const generateReceipt = () => {
    if (!selectedSneaker) return;

    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 650; 
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, 400, 650);

    // Text Setup
    ctx.fillStyle = '#111';
    ctx.font = '24px "Courier New", monospace';
    ctx.textAlign = 'center';

    // Header Info
    ctx.fillText('SNEAKOPEDIA ARCHIVE', 200, 50);
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText('--------------------------------', 200, 70);
    ctx.fillText(`DATE: ${new Date().toLocaleDateString()}`, 200, 90);
    ctx.fillText(`TIME: ${new Date().toLocaleTimeString()}`, 200, 110);
    ctx.fillText('--------------------------------', 200, 130);

    // Item Info
    ctx.font = 'bold 16px "Courier New", monospace';
    const words = selectedSneaker.shoeName.toUpperCase().split(' ');
    let y = 160;
    let line = '';
    
    // Text Wrapping
    for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > 300) {
            ctx.fillText(line, 200, y);
            line = words[i] + ' ';
            y += 25;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, 200, y);
    
    y += 40;
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText(selectedSneaker.brand.toUpperCase(), 200, y);
    
    y += 40;
    ctx.font = 'bold 32px "Courier New", monospace';
    ctx.fillText(formatPrice(selectedSneaker.retailPrice), 200, y);

    y += 60;
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText('--------------------------------', 200, y);
    y += 30;
    ctx.fillText('AUTHENTICATED DIGITAL ASSET', 200, y);
    
    // Barcode Generation
    y += 30;
    ctx.fillStyle = '#000';
    for(let i = 50; i < 350; i+= 5) {
       if(Math.random() > 0.5) ctx.fillRect(i, y, 3, 50);
    }
    
    y += 70;
    ctx.fillStyle = '#111';
    ctx.font = '10px "Courier New", monospace';
    ctx.fillText(`ID: ${selectedSneaker._id}`, 200, y);

    // Download Trigger
    const link = document.createElement('a');
    link.download = `SNEAKOPEDIA_RECEIPT_${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  // --- FEATURE: EXPORT GRAIL LOCKER ---
  const generateGrailsExport = () => {
    if (grails.length === 0) return;

    const ITEM_HEIGHT = 38;
    const HEADER_HEIGHT = 160;
    const FOOTER_HEIGHT = 150;
    const canvasW = 480;
    const canvasH = HEADER_HEIGHT + grails.length * ITEM_HEIGHT + FOOTER_HEIGHT;

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = '#111';

    // Header
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SNEAKOPEDIA', canvasW / 2, 45);
    ctx.font = '12px "Courier New", monospace';
    ctx.fillText('/// GRAIL_LOCKER EXPORT', canvasW / 2, 68);
    ctx.fillText('--------------------------------', canvasW / 2, 90);
    ctx.fillText(`DATE: ${new Date().toLocaleDateString()}`, canvasW / 2, 110);
    ctx.fillText(`PAIRS: ${grails.length}`, canvasW / 2, 130);
    ctx.fillText('--------------------------------', canvasW / 2, 150);

    // Items
    let y = HEADER_HEIGHT + 16;
    grails.forEach((g, i) => {
      const maxChars = 34;
      const rawName = g.shoeName.toUpperCase();
      const displayName = rawName.length > maxChars ? rawName.substring(0, maxChars) + '...' : rawName;

      ctx.font = '11px "Courier New", monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#111';
      ctx.fillText(`${String(i + 1).padStart(2, '0')}. ${displayName}`, 30, y);
      ctx.textAlign = 'right';
      ctx.fillText(formatPrice(g.retailPrice), canvasW - 30, y);

      // Divider
      ctx.fillStyle = '#ddd';
      ctx.fillRect(30, y + 9, canvasW - 60, 1);
      ctx.fillStyle = '#111';
      y += ITEM_HEIGHT;
    });

    // Footer
    y += 10;
    ctx.font = '12px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('--------------------------------', canvasW / 2, y);

    y += 25;
    const total = grails.reduce((sum, g) => sum + (g.retailPrice || 0), 0);
    const avg = Math.round(total / grails.length);
    ctx.font = 'bold 13px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('PORTFOLIO TOTAL', 30, y);
    ctx.textAlign = 'right';
    ctx.fillText(formatPrice(total), canvasW - 30, y);

    y += 20;
    ctx.font = '10px "Courier New", monospace';
    ctx.fillStyle = '#555';
    ctx.textAlign = 'left';
    ctx.fillText(`AVG ${formatPrice(avg)} / PAIR`, 30, y);
    ctx.fillStyle = '#111';

    // Barcode
    y += 28;
    ctx.textAlign = 'center';
    ctx.font = '12px "Courier New", monospace';
    ctx.fillText('--------------------------------', canvasW / 2, y);
    y += 14;
    ctx.fillStyle = '#000';
    for (let i = 40; i < canvasW - 40; i += 5) {
      if (Math.random() > 0.5) ctx.fillRect(i, y, 3, 40);
    }
    y += 55;
    ctx.fillStyle = '#555';
    ctx.font = '9px "Courier New", monospace';
    ctx.fillText('SNEAKOPEDIA // AUTHENTICATED DIGITAL ASSET', canvasW / 2, y);

    const link = document.createElement('a');
    link.download = `SNEAKOPEDIA_GRAILS_${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  // --- INITIALIZATION & EFFECTS ---
  useEffect(() => {
    // Load History
    const saved = localStorage.getItem('sneakopedia_history');
    if (saved) {
      try {
        setRecentViewed(JSON.parse(saved));
      } catch {
        console.error("Failed to load history");
      }
    }

    // Load Grails
    const savedGrails = localStorage.getItem('sneakopedia_grails');
    if (savedGrails) {
      try {
        setGrails(JSON.parse(savedGrails));
      } catch {
        console.error("Failed to load grails");
      }
    }

    // Load Theme
    const savedTheme = localStorage.getItem('sneakopedia_theme');
    if (savedTheme) {
      setTheme(savedTheme);
    }

    // Load My Size
    const savedSize = localStorage.getItem('sneakopedia_mysize');
    if (savedSize) setMySize(savedSize);

    // Load Grid Density
    const savedDensity = localStorage.getItem('sneakopedia_density');
    if (savedDensity) setGridDensity(parseInt(savedDensity) as 3 | 4 | 5);

    // Mobile detection
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);

    // Scroll-to-bottom detection for social links
    const handleScroll = () => {
      const scrolledToBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 100;
      setAtBottom(scrolledToBottom);
    };
    window.addEventListener('scroll', handleScroll);

    // Deep Linking Check
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) {
       fetch(`/api/sneakers?id=${encodeURIComponent(id)}`)
         .then(res => res.json())
         .then(data => {
            if (data && data.length > 0) setSelectedSneaker(data[0]);
            else if (data.data && data.data.length > 0) setSelectedSneaker(data.data[0]);
         })
         .catch(() => {});
    }

    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // --- URL SYNC & HISTORY ---
  useEffect(() => {
    if (selectedSneaker) {
      setImageLoading(true);
      
      const newUrl = `${window.location.pathname}?id=${selectedSneaker._id}`;
      window.history.pushState({ path: newUrl }, '', newUrl);

      setRecentViewed(prev => {
        const filtered = prev.filter(s => s._id !== selectedSneaker._id);
        const updated = [selectedSneaker, ...filtered].slice(0, 10);
        localStorage.setItem('sneakopedia_history', JSON.stringify(updated));
        return updated;
      });
    } else {
      window.history.pushState({ path: '/' }, '', '/');
    }
  }, [selectedSneaker]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setCurrentPage(1);
    }, 300); 
    return () => clearTimeout(timer);
  }, [searchInput]);

  // --- API DATA FETCHING ---
  const fetchSneakers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: debouncedSearch,
        sort: sortType,
        page: currentPage.toString(),
        price: priceRange.toString(),
        priceMin: priceMin.toString(),
        seed: sessionSeed.toString(),
      });
      if (selectedBrands.length > 0) {
        params.append('brands', selectedBrands.join(','));
      }

      setFetchError(null);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`/api/sneakers?${params.toString()}`, { signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();

      setSneakers(data.data || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalItems(data.pagination?.totalItems || 0);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setFetchError('Search timed out. Please try again.');
      } else {
        setFetchError('Failed to load sneakers. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, sortType, currentPage, priceRange, priceMin, selectedBrands, sessionSeed]);

  useEffect(() => {
    fetchSneakers();
  }, [fetchSneakers]);

  // --- AUTOCOMPLETE: derive from grid results (no extra API call) ---
  useEffect(() => {
    if (searchInput.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const results = sneakers.slice(0, 5);
    setSuggestions(results);
    setShowSuggestions(results.length > 0);
  }, [sneakers, searchInput]);

  // --- AUTOCOMPLETE CLICK-OUTSIDE ---
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- HANDLERS ---
  const handleLogoClick = () => {
    setSelectedSneaker(null);
    setSearchInput('');
    setSortType('none');
    setPriceRange(300000);
    setPriceMin(0);
    setActiveBucket('ALL');
    setSelectedBrands([]);
    setCurrentPage(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBrandToggle = (brand: string) => {
    setSelectedBrands(prev =>
      prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand]
    );
    setCurrentPage(1);
  };


  const handlePriceBucket = (min: number, max: number, label: string) => {
    setPriceMin(min);
    setPriceRange(max);
    setActiveBucket(label);
    setCurrentPage(1);
  };

  const handleBackgroundClick = () => {
    setSelectedSneaker(null);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleRandomizer = async () => {
    if (!selectedSneaker) setLoading(true); 
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`/api/sneakers?random=true`, { signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();
      if (data && data.length > 0) {
        setSelectedSneaker(data[0]);
      }
    } catch (error) {
      console.error("Randomizer failed", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
  };

  const handleSizeChange = (size: string) => {
    const next = mySize === size ? '' : size;
    setMySize(next);
    if (next) localStorage.setItem('sneakopedia_mysize', next);
    else localStorage.removeItem('sneakopedia_mysize');
  };

  const handleWhatsAppShare = (sneaker: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const url = `${window.location.origin}/?id=${sneaker._id}`;
    const text = `${sneaker.brand} — ${sneaker.shoeName}\nRetail: ${formatPrice(sneaker.retailPrice)}\n\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleCopyLink = () => {
    if (!selectedSneaker) return;
    const url = `${window.location.origin}/?id=${selectedSneaker._id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  // --- KEYBOARD SHORTCUT: / to focus search ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        !selectedSneaker
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedSneaker]);

  // --- PREV / NEXT in detail view ---
  const selectedIndex = selectedSneaker ? sneakers.findIndex(s => s._id === selectedSneaker._id) : -1;

  const handlePrev = () => {
    if (selectedIndex > 0) setSelectedSneaker(sneakers[selectedIndex - 1]);
  };

  const handleNext = () => {
    if (selectedIndex < sneakers.length - 1) setSelectedSneaker(sneakers[selectedIndex + 1]);
  };

  useEffect(() => {
    if (!selectedSneaker) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')  handlePrev();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'Escape')     setSelectedSneaker(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedSneaker, selectedIndex, sneakers]);

  // --- PLATFORM PRICE LOGIC ---
  // Source of truth: detect which retailer a shoe came from via its thumbnail/url domain.
  // That retailer is ALWAYS shown. The static brand map fills in the rest.
  const getPlatformPrices = (sneaker: any) => {
    const brand = sneaker.brand?.toLowerCase() || '';
    const base  = sneaker.retailPrice;

    // Build live retailer map from scraped retailerLinks (multi-retailer deduplication)
    // Each entry is a direct product URL + actual scraped price for that store.
    const liveLinks: Record<string, { url: string; price: number }> = {};
    if (sneaker.retailerLinks?.length > 0) {
      for (const entry of sneaker.retailerLinks) {
        if (entry.retailer && entry.url && entry.price > 0) {
          liveLinks[entry.retailer] = { url: entry.url, price: entry.price };
        }
      }
    }

    // Map every known domain → retailer name
    const domainToRetailer: Record<string, string> = {
      'crepdogcrew.com':              'Crepdog Crew',
      'marketplace.mainstreet.co.in': 'Mainstreet',
      'superkicks.in':                'Superkicks',
      'images.vegnonveg.com':         'VegNonVeg',
      'vegnonveg.com':                'VegNonVeg',
      'limitededt.in':                'LTD Edition',
      'wearcomet.com':                'Comet Official',
      'baccabucci.com':               'Bacca Bucci',
      'gullylabs.com':                'Gully Labs',
      'seventen.in':                  '7-10 Official',
      'thaely.com':                   'Thaely Official',
    };

    // D2C retailers — if confirmed source is D2C, only show that store
    const d2cRetailers = new Set(['Comet Official', 'Bacca Bucci', 'Gully Labs', '7-10 Official', 'Thaely Official']);

    // Detect confirmed source retailer from url field first, then thumbnail
    const sourceUrl  = sneaker.url       || '';
    const thumbUrl   = sneaker.thumbnail || '';
    let confirmedRetailer: string | null = null;
    for (const candidate of [sourceUrl, thumbUrl]) {
      if (!candidate) continue;
      try {
        const domain = new URL(candidate).hostname.replace('www.', '');
        if (domainToRetailer[domain]) { confirmedRetailer = domainToRetailer[domain]; break; }
      } catch { /* invalid url */ }
    }

    // Static brand map — secondary layer for retailers not confirmed by data
    const brandMap: Record<string, string[]> = {
      nike:            ['Mainstreet', 'VegNonVeg', 'LTD Edition', 'Superkicks', 'Crepdog Crew', 'StockX', 'GOAT'],
      jordan:          ['Mainstreet', 'VegNonVeg', 'LTD Edition', 'Superkicks', 'Crepdog Crew', 'StockX', 'GOAT'],
      adidas:          ['Mainstreet', 'VegNonVeg', 'LTD Edition', 'Superkicks', 'Crepdog Crew', 'StockX', 'GOAT'],
      yeezy:           ['VegNonVeg', 'LTD Edition', 'Crepdog Crew', 'StockX', 'GOAT'],
      'new balance':   ['VegNonVeg', 'LTD Edition', 'Superkicks', 'Crepdog Crew', 'StockX', 'GOAT'],
      asics:           ['VegNonVeg', 'LTD Edition', 'Superkicks', 'Crepdog Crew', 'StockX', 'GOAT'],
      puma:            ['Mainstreet', 'VegNonVeg', 'LTD Edition', 'Superkicks', 'StockX', 'GOAT'],
      reebok:          ['Mainstreet', 'VegNonVeg', 'Superkicks', 'StockX', 'GOAT'],
      converse:        ['Mainstreet', 'VegNonVeg', 'LTD Edition', 'Superkicks', 'StockX', 'GOAT'],
      vans:            ['Mainstreet', 'VegNonVeg', 'LTD Edition', 'Superkicks', 'StockX', 'GOAT'],
      hoka:            ['VegNonVeg', 'LTD Edition', 'Superkicks', 'Crepdog Crew', 'StockX', 'GOAT'],
      'on running':    ['VegNonVeg', 'LTD Edition', 'Superkicks', 'Crepdog Crew', 'StockX', 'GOAT'],
      'on cloud':      ['VegNonVeg', 'LTD Edition', 'Superkicks', 'Crepdog Crew', 'StockX', 'GOAT'],
      salomon:         ['VegNonVeg', 'LTD Edition', 'Superkicks', 'Crepdog Crew', 'StockX', 'GOAT'],
      bape:            ['LTD Edition', 'Crepdog Crew', 'StockX', 'GOAT'],
      balenciaga:      ['StockX', 'GOAT'],
      'off-white':     ['StockX', 'GOAT'],
      'rick owens':    ['StockX', 'GOAT'],
      'louis vuitton': ['StockX', 'GOAT'],
      dior:            ['StockX', 'GOAT'],
      'fear of god':   ['LTD Edition', 'StockX', 'GOAT'],
      essentials:      ['LTD Edition', 'Superkicks', 'Crepdog Crew', 'StockX', 'GOAT'],
      represent:       ['StockX', 'GOAT'],
      mschf:           ['StockX', 'GOAT'],
      'golden goose':  ['StockX', 'GOAT'],
      'maison mihara': ['StockX', 'GOAT'],
      'axel arigato':  ['StockX', 'GOAT'],
      ugg:             ['VegNonVeg', 'LTD Edition', 'Superkicks', 'StockX', 'GOAT'],
      fila:            ['Mainstreet', 'VegNonVeg', 'Superkicks', 'StockX', 'GOAT'],
      'under armour':  ['Mainstreet', 'VegNonVeg', 'Superkicks', 'StockX', 'GOAT'],
      skechers:        ['Mainstreet', 'VegNonVeg', 'Superkicks'],
      birkenstock:     ['VegNonVeg', 'LTD Edition', 'Superkicks', 'StockX', 'GOAT'],
      timberland:      ['Mainstreet', 'VegNonVeg', 'Superkicks', 'StockX', 'GOAT'],
      'dr. martens':   ['VegNonVeg', 'LTD Edition', 'Superkicks', 'StockX', 'GOAT'],
      saucony:         ['VegNonVeg', 'LTD Edition', 'Superkicks', 'Crepdog Crew', 'StockX', 'GOAT'],
      mizuno:          ['VegNonVeg', 'Superkicks', 'StockX', 'GOAT'],
      'li-ning':       ['VegNonVeg', 'Superkicks', 'StockX', 'GOAT'],
      anta:            ['VegNonVeg', 'StockX', 'GOAT'],
      crocs:           ['Mainstreet', 'VegNonVeg', 'Superkicks', 'StockX', 'GOAT'],
      supreme:         ['LTD Edition', 'StockX', 'GOAT'],
      palace:          ['StockX', 'GOAT'],
      stussy:          ['LTD Edition', 'StockX', 'GOAT'],
      'travis scott':  ['StockX', 'GOAT'],
      ovo:             ['StockX', 'GOAT'],
      nocta:           ['LTD Edition', 'Crepdog Crew', 'StockX', 'GOAT'],
      brooks:          ['Mainstreet', 'VegNonVeg', 'Superkicks', 'Crepdog Crew', 'StockX', 'GOAT'],
      columbia:        ['Mainstreet', 'VegNonVeg', 'Superkicks', 'StockX', 'GOAT'],
      merrell:         ['Mainstreet', 'VegNonVeg', 'Superkicks', 'StockX', 'GOAT'],
      // D2C — handled entirely by confirmedRetailer detection above
      comet:           ['Comet Official'],
      thaely:          ['Thaely Official'],
      'gully labs':    ['Gully Labs'],
      '7-10':          ['7-10 Official'],
      'bacca bucci':   ['Bacca Bucci'],
    };

    const multipliers: Record<string, number> = {
      'Mainstreet':      1.00,
      'VegNonVeg':       1.02,
      'LTD Edition':     1.02,
      'Superkicks':      1.00,
      'Crepdog Crew':    1.05,
      'Comet Official':  1.00,
      'Thaely Official': 1.00,
      'Gully Labs':      1.00,
      '7-10 Official':   1.00,
      'Bacca Bucci':     1.00,
    };

    // Build availableAt:
    // 1. If confirmed source is D2C → only that store
    // 2. Otherwise → brand map result (or all retailers if unmapped) + confirmed source merged in
    const allRetailers = ['Mainstreet', 'VegNonVeg', 'LTD Edition', 'Superkicks', 'Crepdog Crew', 'StockX', 'GOAT'];
    let availableAt: string[];

    if (confirmedRetailer && d2cRetailers.has(confirmedRetailer)) {
      availableAt = [confirmedRetailer];
    } else {
      const matchedKey = Object.keys(brandMap).find(k => brand.includes(k));
      availableAt = matchedKey ? [...brandMap[matchedKey]] : [...allRetailers];
      // Always include confirmed source retailer
      if (confirmedRetailer && !availableAt.includes(confirmedRetailer)) {
        availableAt.push(confirmedRetailer);
      }
    }

    const links = getLinks(sneaker.shoeName, sneaker.brand);

    // Priority for URL: (1) scraped retailerLinks entry, (2) legacy single url field, (3) search URL
    const resolveUrl = (linkName: string, searchUrl: string): string =>
      liveLinks[linkName]?.url
      ?? (sourceUrl && confirmedRetailer === linkName ? sourceUrl : searchUrl);

    // Priority for price: (1) actual scraped price from retailerLinks, (2) estimated from multiplier
    const resolvePrice = (linkName: string): number | null => {
      if (liveLinks[linkName]) return liveLinks[linkName].price;
      return availableAt.includes(linkName)
        ? Math.round(base * (multipliers[linkName] ?? 1.0))
        : null;
    };

    // A retailer is "live" if it appears in scraped retailerLinks OR is the legacy confirmed source
    const liveRetailers = new Set([
      ...Object.keys(liveLinks),
      ...(confirmedRetailer ? [confirmedRetailer] : []),
    ]);

    return {
      confirmedRetailer: confirmedRetailer ?? null,
      liveRetailers,
      desi: links.desi.map((link: any) => ({
        ...link,
        url:   resolveUrl(link.name, link.url),
        price: resolvePrice(link.name),
      })),
      global: links.global.map((link: any) => ({
        ...link,
        url:   resolveUrl(link.name, link.url),
        price: resolvePrice(link.name),
      })),
    };
  };


  // ============================================================================
  // RENDER UI
  // ============================================================================
  return (
    <div className={`min-h-screen bg-[#09090b] text-zinc-100 font-sans selection:bg-${theme}-500 selection:text-white relative overflow-x-hidden pb-32`}>
      
      {/* TOP ACCENT BAR */}
      <div className="fixed top-0 left-0 right-0 h-[3px] z-[999] transition-colors duration-500" style={{ backgroundColor: hex }}></div>

      {/* MOBILE SIDEBAR BACKDROP */}
      {(showFilters || showGrails) && isMobile && (
        <div
          className="fixed inset-0 bg-black/70 z-[54]"
          onClick={() => { setShowFilters(false); setShowGrails(false); }}
        />
      )}

      {/* BACKGROUND GRID */}
      <div
        className="fixed inset-0 pointer-events-none transition-all duration-500"
        style={{
          backgroundImage: `linear-gradient(${hex}25 1px, transparent 1px), linear-gradient(90deg, ${hex}25 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }}
      />

      {/* 4. NAVBAR (FIXED TOP) */}
      <nav className="fixed top-0 w-full z-50 px-6 py-4 flex items-start justify-between bg-[#09090b]/80 backdrop-blur-sm border-b transition-all duration-500" style={{ borderBottomColor: `${hex}40` }}>
        <div onClick={handleLogoClick} className="cursor-pointer group flex items-center gap-3 pt-1">
           <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: hex }}></div>
           <span className="font-mono text-xs font-bold tracking-widest uppercase transition-colors duration-300 group-hover:text-white" style={{ color: hex }}>
             System_Access // Home
           </span>
        </div>
        
        <div className="flex items-center gap-4">
            {/* RANDOM BUTTON */}
            <button
              onClick={handleRandomizer}
              disabled={loading && !selectedSneaker}
              className={`flex items-center gap-2 px-3 md:px-4 py-1.5 border border-zinc-700 bg-zinc-900/50 hover:bg-${theme}-900/20 hover:border-${theme}-500/50 transition-all group rounded disabled:opacity-50 disabled:cursor-wait`}
            >
              <span className={`font-mono text-[10px] text-zinc-400 group-hover:text-${theme}-300 uppercase tracking-wider`}>
                <span className="hidden md:inline">{loading ? '[ PROCESSING... ]' : '[ RANDOM_ACCESS ]'}</span>
                <span className="md:hidden" style={{ color: hex }}>?</span>
              </span>
            </button>

            {/* GRAIL LOCKER BUTTON */}
            <button
              onClick={() => setShowGrails(!showGrails)}
              className={`flex items-center gap-2 px-3 md:px-4 py-1.5 border transition-all group rounded ${
                showGrails
                  ? `border-${theme}-500 bg-${theme}-900/20 text-white`
                  : `border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-${theme}-500/50`
              }`}
            >
              <span className="font-mono text-[10px] uppercase tracking-wider">
                <span className="hidden md:inline">[ GRAIL_LOCKER ({grails.length}) ]</span>
                <span className="md:hidden">♡{grails.length > 0 ? ` ${grails.length}` : ''}</span>
              </span>
            </button>
        </div>
      </nav>

      {/* 5. FILTER SIDEBAR (LEFT) */}
      <aside className={`fixed top-0 left-0 h-full bg-[#0d0d0d] border-r border-zinc-800 z-[55] transition-all duration-300 ease-in-out pt-20 md:pt-32 px-6 overflow-y-auto ${showFilters ? 'w-full sm:w-80 translate-x-0 shadow-2xl' : 'w-0 -translate-x-full opacity-0'}`}>
        <div className="min-w-[280px]">
           <div className="flex justify-between items-center mb-8">
             <h2 className={`font-mono text-sm text-${theme}-500 font-bold uppercase tracking-wider`}>{"/// PARAMETERS"}</h2>
             <button onClick={() => setShowFilters(false)} className="text-zinc-500 hover:text-white">✕</button>
           </div>

           {/* PRICE SLIDER */}
           <div className="mb-10">
             <label className="block font-mono text-[10px] text-zinc-400 uppercase mb-4">
               Max Price: {formatPrice(priceRange)}
             </label>
             <input
               type="range"
               min="0"
               max="300000"
               step="2500"
               value={priceRange}
               onChange={(e) => setPriceRange(parseInt(e.target.value))}
               className={`w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-${theme}-500`}
             />
             <div className="flex justify-between mt-2 font-mono text-[9px] text-zinc-600">
                <span>₹0</span>
                <span>₹3L+</span>
             </div>
           </div>

           {/* MY SIZE */}
           <div className="mb-10">
             <label className="block font-mono text-[10px] text-zinc-400 uppercase mb-1">My Size (US)</label>
             {mySize && (
               <p className="font-mono text-[9px] mb-3" style={{ color: hex }}>
                 Active: US {mySize} — retailer links are size-filtered
               </p>
             )}
             <div className="grid grid-cols-4 gap-1.5">
               {['6','6.5','7','7.5','8','8.5','9','9.5','10','10.5','11','11.5','12','13','14'].map(s => (
                 <button
                   key={s}
                   onClick={() => handleSizeChange(s)}
                   className="py-2 font-mono text-[10px] border transition-all"
                   style={{
                     background: mySize === s ? `${hex}20` : '#18181b',
                     borderColor: mySize === s ? hex : '#3f3f46',
                     color: mySize === s ? '#fff' : '#71717a',
                   }}
                 >
                   {s}
                 </button>
               ))}
             </div>
           </div>

           {/* BRAND CHECKBOXES */}
           <div>
             <label className="block font-mono text-[10px] text-zinc-400 uppercase mb-4">Brand Filters</label>
             <div className="grid grid-cols-2 gap-2">
               {ALL_BRANDS.map(brand => (
                 <button 
                   key={brand}
                   onClick={() => handleBrandToggle(brand)}
                   className={`text-left px-3 py-2 font-mono text-[10px] uppercase border transition-all ${
                     selectedBrands.includes(brand) 
                       ? `bg-${theme}-900/20 border-${theme}-500 text-white` 
                       : `bg-zinc-900/50 border-zinc-800 text-zinc-500 hover:border-zinc-600`
                   }`}
                 >
                   [{selectedBrands.includes(brand) ? 'x' : ' '}] {brand}
                 </button>
               ))}
             </div>
           </div>

           {/* CLEAR BUTTON */}
           <button 
             onClick={() => { setSelectedBrands([]); setPriceRange(200000); setPriceMin(0); setActiveBucket('ALL'); setSearchInput(''); setDebouncedSearch(''); setSortType('none'); setCurrentPage(1); }}
             className="w-full mt-12 py-3 border border-red-900/50 text-red-500 hover:bg-red-900/20 font-mono text-[10px] uppercase"
           >
             RESET_ALL_SYSTEMS
           </button>
        </div>
      </aside>

      {/* 6. GRAIL SIDEBAR (RIGHT) */}
      <aside className={`fixed top-0 right-0 h-full bg-[#0d0d0d] border-l border-zinc-800 z-[55] transition-all duration-300 ease-in-out pt-20 md:pt-32 px-6 overflow-y-auto ${showGrails ? 'w-full sm:w-80 translate-x-0 shadow-2xl' : 'w-0 translate-x-full opacity-0'}`}>
         <div className="min-w-[280px]">
           <div className="flex justify-between items-center mb-8">
             <h2 className={`font-mono text-sm text-${theme}-500 font-bold uppercase tracking-wider`}>{"/// GRAIL_LOCKER"}</h2>
             <button onClick={() => setShowGrails(false)} className="text-zinc-500 hover:text-white">✕</button>
           </div>

           {/* GRAILS */}
           <p className="font-mono text-[9px] text-zinc-600 uppercase mb-3">Saved ({grails.length})</p>

           {/* PORTFOLIO VALUE */}
           {grails.length > 0 && (
             <div className="mb-5 p-3 border border-zinc-800 bg-zinc-900/30">
               <p className="font-mono text-[9px] text-zinc-500 uppercase mb-1">Portfolio Value</p>
               <p className="font-mono text-base font-bold" style={{ color: hex }}>
                 {formatPrice(grails.reduce((sum, g) => sum + (g.retailPrice || 0), 0))}
               </p>
               <p className="font-mono text-[9px] text-zinc-600 mt-1">
                 avg {formatPrice(Math.round(grails.reduce((sum, g) => sum + (g.retailPrice || 0), 0) / grails.length))} per pair
               </p>
             </div>
           )}

           {grails.length > 0 && (
             <button
               onClick={generateGrailsExport}
               className="w-full mb-5 py-2.5 border font-mono text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 group"
               style={{ borderColor: `${hex}40`, color: `${hex}80`, background: `${hex}08` }}
               onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = hex; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
               onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = `${hex}40`; (e.currentTarget as HTMLButtonElement).style.color = `${hex}80`; }}
             >
               <span>[ EXPORT_LOCKER ]</span>
               <span className="group-hover:translate-y-0.5 transition-transform">↓</span>
             </button>
           )}

           {grails.length === 0 ? (
             <div className="text-zinc-700 font-mono text-[10px] uppercase text-center py-4 border border-dashed border-zinc-800">Locker Empty.</div>
           ) : (
             <div className="space-y-3">
               {grails.map((g) => (
                 <div
                   key={g._id}
                   onClick={() => setSelectedSneaker(g)}
                   className={`flex gap-3 p-2 bg-zinc-900/50 border border-zinc-800 hover:border-${theme}-500 cursor-pointer group`}
                 >
                   <div className="w-14 h-14 bg-zinc-800 flex-shrink-0 flex items-center justify-center overflow-hidden">
                     <img src={getSafeImage(g)} className="w-full h-full object-cover mix-blend-screen" alt={g.shoeName} />
                   </div>
                   <div className="flex-1 min-w-0">
                     <h4 className="font-bold text-[10px] text-zinc-300 uppercase line-clamp-1 group-hover:text-white">{g.shoeName}</h4>
                     <p className={`font-mono text-${theme}-400 text-[10px]`}>{formatPrice(g.retailPrice)}</p>
                   </div>
                 </div>
               ))}
             </div>
           )}

           {/* RECENTLY VIEWED */}
           {recentViewed.length > 0 && (
             <>
               <div className="border-t border-zinc-800 my-6" />
               <p className="font-mono text-[9px] text-zinc-600 uppercase mb-3">Recently Viewed ({recentViewed.length})</p>
               <div className="space-y-3">
                 {recentViewed.map((s) => (
                   <div
                     key={s._id}
                     onClick={() => { setSelectedSneaker(s); setShowGrails(false); }}
                     className="flex gap-3 p-2 bg-zinc-900/30 border border-zinc-800/60 hover:border-zinc-600 cursor-pointer group transition-all"
                   >
                     <div className="w-14 h-14 bg-zinc-800 flex-shrink-0 flex items-center justify-center overflow-hidden">
                       <img
                         src={getSafeImage(s)}
                         alt={s.shoeName}
                         className="w-full h-full object-cover mix-blend-screen group-hover:scale-105 transition-transform"
                         onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = getFallbackLogo(s.brand); }}
                       />
                     </div>
                     <div className="flex-1 min-w-0">
                       <p className="font-mono text-[9px] text-zinc-600 uppercase truncate">{s.brand}</p>
                       <h4 className="font-bold text-[10px] text-zinc-400 uppercase line-clamp-1 group-hover:text-white">{s.shoeName}</h4>
                       <p className="font-mono text-[10px] mt-0.5" style={{ color: `${hex}90` }}>{formatPrice(s.retailPrice)}</p>
                     </div>
                   </div>
                 ))}
               </div>
             </>
           )}
         </div>
      </aside>

      {/* 7. MAIN CONTENT AREA */}
      <main
        className="relative flex flex-col items-center justify-center min-h-screen px-4 py-32 z-10"
        style={{
          paddingLeft:  (!isMobile && showFilters) ? '320px' : '1rem',
          paddingRight: (!isMobile && showGrails)  ? '320px' : '1rem',
        }}
      >
        
        {!selectedSneaker ? (
          
          /* --- A. HOME VIEW (GRID) --- */
          <div className="w-full max-w-[1400px] flex flex-col items-center animate-in fade-in duration-500">
            
            {/* HERO */}
            <div className="text-center space-y-6 mb-16 relative z-10 flex flex-col items-center w-full mt-8">
              {/* Ambient glow behind title */}
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[300px] pointer-events-none transition-all duration-500"
                style={{ background: `radial-gradient(ellipse at center, ${hex}18 0%, transparent 70%)` }}
              />
              <h1
                onClick={handleLogoClick}
                className="cursor-pointer text-6xl md:text-9xl font-black tracking-tighter uppercase leading-[0.8] transition-all duration-500 hover:opacity-80"
                style={{
                  color: hex,
                  textShadow: `0 0 60px ${hex}80, 0 0 120px ${hex}40, 0 0 200px ${hex}20`
                }}
              >
                SNEAKOPEDIA
              </h1>
              <p className="font-mono text-zinc-500 text-xs md:text-sm uppercase tracking-widest underline underline-offset-8" style={{ textDecorationColor: `${hex}60` }}>
                The Ultimate Sneaker Archive // Database {totalItems > 0 && `(${totalItems} Indexed)`}
              </p>
            </div>
            
            {/* CONTROLS */}
            <div className="w-full max-w-4xl mb-4 grid md:grid-cols-4 gap-4">
              
              {/* FILTER BUTTON */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-wider transition-all duration-300"
                style={{
                  background: showFilters ? `${hex}15` : '#0d0d0d',
                  border: `1px solid ${showFilters ? hex : `${hex}50`}`,
                  color: showFilters ? '#fff' : `${hex}90`,
                }}
              >
                <span>{showFilters ? '[-]' : '[+]'}</span> PARAMETERS{activeFilterCount > 0 ? ` [${activeFilterCount}]` : ''}
              </button>

              <div className="md:col-span-2 relative" ref={autocompleteRef}>
                <div className="flex items-center bg-[#0d0d0d] rounded-sm transition-all duration-300" style={{ border: `1px solid ${hex}50` }} onFocus={({ currentTarget }) => { currentTarget.style.borderColor = hex; }} onBlur={({ currentTarget }) => { currentTarget.style.borderColor = `${hex}50`; }}>
                  <span className="pl-4 font-mono" style={{ color: hex }}>{'>'}</span>
                  <input
                    type="text"
                    placeholder="SEARCH_ARCHIVE..."
                    ref={searchInputRef}
                    value={searchInput}
                    onChange={handleSearchChange}
                    onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setShowSuggestions(false); searchInputRef.current?.blur(); } }}
                    className="w-full bg-transparent border-none px-4 py-4 text-lg text-white placeholder-zinc-600 focus:outline-none font-mono uppercase"
                  />
                  {searchInput && (
                    <button
                      onClick={() => { setSearchInput(''); setSuggestions([]); setShowSuggestions(false); }}
                      className="pr-4 text-zinc-600 hover:text-white transition-colors font-mono text-sm"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* AUTOCOMPLETE DROPDOWN */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-[60] mt-1 shadow-2xl border border-zinc-700 bg-[#0d0d0d] overflow-hidden">
                    {suggestions.map((s) => (
                      <button
                        key={s._id}
                        onClick={() => { setSelectedSneaker(s); setShowSuggestions(false); }}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 cursor-pointer transition-colors border-b border-zinc-800 last:border-b-0 text-left group"
                      >
                        <div className="w-8 h-8 flex-shrink-0 bg-zinc-900 flex items-center justify-center overflow-hidden">
                          <img src={getSafeImage(s)} alt="" className="w-full h-full object-contain mix-blend-screen" onError={(e) => { e.currentTarget.src = getFallbackLogo(s.brand); }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-[10px] text-zinc-300 uppercase truncate group-hover:text-white leading-tight">{s.shoeName}</p>
                          <p className="font-mono text-[9px] text-zinc-500 uppercase">{s.brand}</p>
                        </div>
                        <span className="font-mono text-[10px] font-bold flex-shrink-0" style={{ color: hex }}>{formatPrice(s.retailPrice)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center bg-[#0d0d0d] rounded-sm px-2 transition-all duration-300" style={{ border: `1px solid ${hex}50` }}>
                <span className="text-[10px] font-mono text-zinc-500 px-2 uppercase">Sort:</span>
                <select
                  value={sortType}
                  onChange={(e) => setSortType(e.target.value)}
                  className="bg-transparent text-white font-mono text-xs p-3 outline-none w-full uppercase cursor-pointer"
                >
                  <option value="none">DEFAULT</option>
                  <option value="price-asc">LOW-HIGH</option>
                  <option value="price-desc">HIGH-LOW</option>
                  <option value="name-asc">A-Z</option>
                </select>
              </div>
            </div>

            {/* ACTIVE FILTER CHIPS */}
            {activeFilterCount > 0 && (
              <div className="w-full max-w-4xl mb-3 flex flex-wrap gap-2">
                {activeBucket !== 'ALL' && (
                  <button
                    onClick={() => handlePriceBucket(0, 300000, 'ALL')}
                    className="flex items-center gap-1.5 px-3 py-1 font-mono text-[10px] uppercase transition-all"
                    style={{ background: `${hex}15`, border: `1px solid ${hex}50`, color: hex }}
                  >
                    {activeBucket} <span>✕</span>
                  </button>
                )}
                {selectedBrands.map(brand => (
                  <button
                    key={brand}
                    onClick={() => handleBrandToggle(brand)}
                    className="flex items-center gap-1.5 px-3 py-1 font-mono text-[10px] uppercase transition-all"
                    style={{ background: `${hex}15`, border: `1px solid ${hex}50`, color: hex }}
                  >
                    {brand} <span>✕</span>
                  </button>
                ))}
                {activeFilterCount > 1 && (
                  <button
                    onClick={() => { setSelectedBrands([]); handlePriceBucket(0, 300000, 'ALL'); }}
                    className="px-3 py-1 font-mono text-[10px] uppercase text-zinc-500 border border-zinc-800 hover:text-red-400 hover:border-red-900/50 transition-all"
                  >
                    CLEAR ALL
                  </button>
                )}
              </div>
            )}

            {/* PRICE BUCKET QUICK FILTERS */}
            <div className="w-full max-w-4xl mb-3 flex gap-2">
              {PRICE_BUCKETS.map(({ label, min, max }) => (
                <button
                  key={label}
                  onClick={() => handlePriceBucket(min, max, label)}
                  className="flex-1 py-2 font-mono text-[10px] uppercase tracking-wider transition-all duration-200"
                  style={{
                    background: activeBucket === label ? `${hex}20` : '#0d0d0d',
                    border: `1px solid ${activeBucket === label ? hex : `${hex}30`}`,
                    color: activeBucket === label ? '#fff' : `${hex}70`,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* BRAND QUICK-FILTER CHIPS */}
            <div className="w-full max-w-4xl mb-16 overflow-x-auto scrollbar-hide">
              <div className="flex gap-2 pb-1" style={{ minWidth: 'max-content' }}>
                {ALL_BRANDS.map(brand => (
                  <button
                    key={brand}
                    onClick={() => handleBrandToggle(brand)}
                    className="px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider whitespace-nowrap transition-all duration-200"
                    style={{
                      background: selectedBrands.includes(brand) ? `${hex}20` : '#0d0d0d',
                      border: `1px solid ${selectedBrands.includes(brand) ? hex : `${hex}25`}`,
                      color: selectedBrands.includes(brand) ? '#fff' : '#71717a',
                    }}
                  >
                    {selectedBrands.includes(brand) ? `✕ ${brand}` : brand}
                  </button>
                ))}
              </div>
            </div>

            {/* GRID DENSITY TOOLBAR */}
            <div className="w-full flex items-center justify-between mb-2">
              <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider">
                {!loading && totalItems > 0 ? `${totalItems.toLocaleString()} RESULTS` : ''}
              </span>
              <div className="flex items-center gap-1">
                <span className="font-mono text-[9px] text-zinc-600 uppercase mr-2 tracking-wider">GRID:</span>
                {([3, 4, 5] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => { setGridDensity(d); localStorage.setItem('sneakopedia_density', String(d)); }}
                    className="w-7 h-7 font-mono text-[9px] border transition-all duration-200"
                    style={{
                      background: gridDensity === d ? `${hex}20` : '#0d0d0d',
                      borderColor: gridDensity === d ? hex : `${hex}30`,
                      color: gridDensity === d ? '#fff' : `${hex}50`,
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* ERROR BANNER */}
            {fetchError && (
              <div className="mt-4 w-full border border-red-900/50 bg-red-950/30 p-4 flex items-center justify-between">
                <span className="font-mono text-xs text-red-400">{fetchError}</span>
                <button onClick={() => setFetchError(null)} className="font-mono text-[10px] text-red-500 hover:text-red-300 ml-4">DISMISS</button>
              </div>
            )}

            {/* GRID RESULTS */}
            {loading ? (
               <div className="mt-8 w-full border-t border-zinc-800 pt-12 opacity-60 grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
                  {[1,2,3,4,5,6,7,8].map(i => (
                    <div key={i} className="h-48 border border-dashed border-zinc-700 bg-zinc-900/20 flex items-center justify-center relative overflow-hidden">
                      <div className="absolute top-2 left-2 w-2 h-2 border-l border-t border-zinc-600"></div>
                      <div className="absolute bottom-2 right-2 w-2 h-2 border-r border-b border-zinc-600"></div>
                      <span className="font-mono text-[9px] text-zinc-700">FETCHING_DATA...</span>
                    </div>
                  ))}
               </div>
            ) : sneakers.length > 0 ? (
              <>
                <div className={`grid gap-4 w-full animate-in slide-in-from-bottom-8 ${
                  gridDensity === 3 ? 'grid-cols-2 md:grid-cols-3' :
                  gridDensity === 4 ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4' :
                  'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
                }`}>
                  {sneakers.map((sneaker: any, index: number) => (
                    
                    /* HOLOGRAPHIC CARD */
                    <div
                      key={sneaker._id}
                      onClick={() => setSelectedSneaker(sneaker)}
                      className="group relative p-[1px] cursor-pointer h-full overflow-hidden"
                    >
                      {/* BORDER */}
                      <div
                        className="absolute inset-0 group-hover:holo-border transition-all duration-300"
                        style={{ backgroundColor: `${hex}30` }}
                      ></div>
                      
                      {/* CONTENT */}
                      <div className="relative flex flex-col bg-[#111] h-full">
                        <div className="flex justify-between items-center p-3 border-b border-zinc-800 bg-zinc-900/30">
                           <span className="font-mono text-[9px] text-zinc-500 uppercase line-clamp-1">{sneaker.brand}</span>
                           <div className="flex items-center gap-2">
                             {/* WA SHARE — hover reveal */}
                             <button
                               onClick={(e) => handleWhatsAppShare(sneaker, e)}
                               title="Share on WhatsApp"
                               className={`${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity font-mono text-[9px] text-zinc-600 hover:text-green-400 px-1`}
                             >
                               WA↗
                             </button>
                             <div className="w-1 h-1 rounded-full transition-all duration-300" style={{ backgroundColor: `${hex}50` }} onMouseEnter={({ currentTarget }) => { currentTarget.style.backgroundColor = hex; }} onMouseLeave={({ currentTarget }) => { currentTarget.style.backgroundColor = `${hex}50`; }}></div>
                           </div>
                        </div>
                        
                        <div className="aspect-square relative flex items-center justify-center p-4 bg-[#151515]">
                          <img 
                            src={getSafeImage(sneaker)} 
                            alt={sneaker.shoeName} 
                            loading={index < 4 ? "eager" : "lazy"} 
                            className="object-contain w-full h-full mix-blend-screen transition-all duration-300 group-hover:scale-105"
                            onError={(e) => { 
                              e.currentTarget.onerror = null; 
                              e.currentTarget.src = getFallbackLogo(sneaker.brand); 
                            }}
                          />
                        </div>
                        
                        <div className="p-4 mt-auto border-t border-zinc-800 bg-[#111]">
                          <h3 className="font-bold text-xs uppercase line-clamp-2 h-9 mb-4 text-zinc-300 group-hover:text-white transition-colors">{sneaker.shoeName}</h3>
                          <p className={`font-mono text-${theme}-400 text-sm font-bold`}>{formatPrice(sneaker.retailPrice)}</p>
                        </div>
                      </div>
                    </div>

                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-20 border border-zinc-800 bg-zinc-900 px-4 py-3 flex-wrap">
                    <button
                      onClick={() => { setCurrentPage(1); window.scrollTo({top:0, behavior:'smooth'}); }}
                      disabled={currentPage === 1}
                      className="text-zinc-400 hover:text-white disabled:opacity-30 text-xs font-mono px-2"
                    >
                      {'<< FIRST'}
                    </button>
                    <button
                      onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); window.scrollTo({top:0, behavior:'smooth'}); }}
                      disabled={currentPage === 1}
                      className="text-zinc-400 hover:text-white disabled:opacity-30 text-xs font-mono px-2"
                    >
                      {'< PREV'}
                    </button>
                    <span className="font-mono text-zinc-300 text-xs tracking-tighter flex items-center gap-1">
                      PAGE{' '}
                      <input
                        type="number"
                        min={1}
                        max={totalPages}
                        value={currentPage}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val) && val >= 1 && val <= totalPages) {
                            setCurrentPage(val);
                            window.scrollTo({top:0, behavior:'smooth'});
                          }
                        }}
                        className="w-12 bg-zinc-800 border border-zinc-700 text-center text-zinc-200 font-mono text-xs py-1 rounded-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      {' '}/ {totalPages}
                    </span>
                    <button
                      onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); window.scrollTo({top:0, behavior:'smooth'}); }}
                      disabled={currentPage === totalPages}
                      className="text-zinc-400 hover:text-white disabled:opacity-30 text-xs font-mono px-2"
                    >
                      {'NEXT >'}
                    </button>
                    <button
                      onClick={() => { setCurrentPage(totalPages); window.scrollTo({top:0, behavior:'smooth'}); }}
                      disabled={currentPage === totalPages}
                      className="text-zinc-400 hover:text-white disabled:opacity-30 text-xs font-mono px-2"
                    >
                      {'LAST >>'}
                    </button>
                  </div>
                )}
              </>
            ) : (
               <div className="mt-12 text-zinc-500 font-mono text-xs border border-zinc-800 p-8 text-center">
                 {debouncedSearch ? (
                   <div className="space-y-3">
                     <p className="uppercase">No results for &quot;{debouncedSearch}&quot;</p>
                     <p className="text-zinc-600 normal-case">Try a different search term, remove some filters, or check your spelling.</p>
                     {(selectedBrands.length > 0 || priceRange < 200000 || priceMin > 0) && (
                       <button
                         onClick={() => { setSelectedBrands([]); setPriceRange(200000); setPriceMin(0); setActiveBucket('ALL'); setCurrentPage(1); }}
                         className="mt-2 px-4 py-2 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 font-mono text-[10px] uppercase transition-colors"
                       >
                         Clear all filters
                       </button>
                     )}
                   </div>
                 ) : (
                   <p className="uppercase">System Ready. Awaiting Input.</p>
                 )}
               </div>
            )}


          </div>
        ) : (

          /* --- B. DETAIL VIEW (MODAL) --- */
          <div 
             className="w-full min-h-[50vh] flex flex-col items-center justify-center pt-6 animate-in zoom-in-95 cursor-pointer" 
             onClick={handleBackgroundClick} 
          >
            <div 
              className="w-full max-w-6xl cursor-default" 
              onClick={handleCardClick} 
            >
              {/* NAV BAR: back + prev/next */}
              <div className="flex items-center justify-between mb-8">
                <button
                  onClick={() => setSelectedSneaker(null)}
                  className="font-mono text-xs uppercase tracking-widest flex items-center gap-2 group transition-colors text-zinc-500 hover:text-white"
                >
                  <span className="group-hover:-translate-x-1 transition-transform">←</span> Return to Index
                </button>

                {sneakers.length > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handlePrev}
                      disabled={selectedIndex <= 0}
                      className="px-3 py-1.5 border border-zinc-800 font-mono text-[10px] uppercase transition-all disabled:opacity-20 hover:border-zinc-500 hover:text-white text-zinc-400"
                    >
                      ← PREV
                    </button>
                    <span className="px-3 font-mono text-[10px] text-zinc-600">
                      {selectedIndex + 1} / {sneakers.length}
                    </span>
                    <button
                      onClick={handleNext}
                      disabled={selectedIndex >= sneakers.length - 1}
                      className="px-3 py-1.5 border border-zinc-800 font-mono text-[10px] uppercase transition-all disabled:opacity-20 hover:border-zinc-500 hover:text-white text-zinc-400"
                    >
                      NEXT →
                    </button>
                  </div>
                )}
              </div>

              <div className="p-[1px] bg-zinc-800 hover:holo-border transition-all duration-500">
                <div className="grid md:grid-cols-2 bg-[#111] shadow-2xl">
                  
                  {/* IMAGE SIDE */}
                  <div className="aspect-square flex items-center justify-center p-12 border-b md:border-b-0 md:border-r border-zinc-800 bg-zinc-900/20 relative overflow-hidden">
                     <div className="absolute top-4 left-4 font-mono text-[9px] text-zinc-600 z-10">FIG. 01</div>
                     
                     {imageLoading && (
                       <div className="absolute inset-0 bg-zinc-900/80 z-20 flex items-center justify-center animate-pulse">
                         <span className="font-mono text-[10px] text-zinc-500 tracking-widest">LOADING_ASSET...</span>
                       </div>
                     )}

                     <img 
                        key={selectedSneaker._id} 
                        src={getSafeImage(selectedSneaker)} 
                        alt={selectedSneaker.shoeName} 
                        className={`object-contain w-full h-full mix-blend-screen drop-shadow-2xl transition-opacity duration-300 ${imageLoading ? 'opacity-0' : 'opacity-100'}`}
                        onLoad={() => setImageLoading(false)}
                        onError={(e) => { 
                          e.currentTarget.onerror = null; 
                          e.currentTarget.src = getFallbackLogo(selectedSneaker.brand); 
                          setImageLoading(false);
                        }}
                     />
                  </div>
                  
                  {/* DATA SIDE */}
                  <div className="p-8 md:p-12 flex flex-col justify-center bg-[#0d0d0d] relative">
                    
                    {/* SAVE BUTTON & BRAND */}
                    <div className="flex justify-between items-start mb-6 w-full">
                       <span className={`px-2 py-0.5 border border-${theme}-900 bg-${theme}-900/20 text-${theme}-400 text-[10px] font-mono uppercase w-fit`}>
                         {selectedSneaker.brand}
                       </span>
                       
                       <button 
                         onClick={() => toggleGrail(selectedSneaker)}
                         className={`flex items-center gap-2 px-3 py-1 border transition-all cursor-pointer ${
                           grails.find(g => g._id === selectedSneaker._id) 
                             ? `bg-${theme}-900 text-white border-${theme}-500` 
                             : `bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-${theme}-500`
                         }`}
                       >
                         <span className="font-mono text-[10px] uppercase">
                           {grails.find(g => g._id === selectedSneaker._id) ? '[ SAVED_TO_GRAILS ]' : '[ + ADD_TO_GRAILS ]'}
                         </span>
                       </button>
                    </div>

                    {/* SHOE TITLE */}
                    <h1 className="text-3xl md:text-5xl font-black uppercase mb-6 leading-none text-white">
                      {selectedSneaker.shoeName}
                    </h1>
                    
                    {/* PRICE BLOCK */}
                    <div className="py-6 border-y border-zinc-800 flex justify-between items-center mb-8">
                       <span className="font-mono text-zinc-500 text-xs uppercase tracking-tighter">Retail Price (MRP)</span>
                       <span className={`text-3xl font-mono font-bold text-${theme}-500`}>{formatPrice(selectedSneaker.retailPrice)}</span>
                    </div>

                    {/* PLATFORM PRICES */}
                    {(() => {
                      const prices = getPlatformPrices(selectedSneaker);
                      const { confirmedRetailer, liveRetailers } = prices;

                      const globalRetailers = new Set(['StockX', 'GOAT']);

                      const renderLink = (link: any, idx: number) => {
                        const isLive = liveRetailers.has(link.name);
                        const isGlobal = globalRetailers.has(link.name);

                        // Global retailers (StockX, GOAT) are always shown as active links
                        // but without an INR price — they sell in USD at resale rates
                        if (isGlobal) {
                          return (
                            <a
                              key={idx}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex justify-between items-center px-4 py-3 bg-zinc-900 border border-transparent font-mono text-[10px] uppercase group transition-all cursor-pointer"
                              onMouseEnter={({ currentTarget }) => { currentTarget.style.borderColor = hex; }}
                              onMouseLeave={({ currentTarget }) => { currentTarget.style.borderColor = 'transparent'; }}
                            >
                              <span className="font-bold text-zinc-300 group-hover:text-white">{link.name}</span>
                              <div className="flex items-center gap-3">
                                <span className="text-zinc-500 text-[9px]">USD — check site</span>
                                <span className="text-zinc-600 group-hover:text-zinc-300">↗</span>
                              </div>
                            </a>
                          );
                        }

                        return link.price ? (
                          <a
                            key={idx}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex justify-between items-center px-4 py-3 bg-zinc-900 border border-transparent font-mono text-[10px] uppercase group transition-all cursor-pointer"
                            onMouseEnter={({ currentTarget }) => { currentTarget.style.borderColor = hex; }}
                            onMouseLeave={({ currentTarget }) => { currentTarget.style.borderColor = 'transparent'; }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-zinc-300 group-hover:text-white">{link.name}</span>
                              {isLive && (
                                <span className="px-1.5 py-0.5 text-[8px] font-bold rounded-sm" style={{ backgroundColor: `${hex}25`, color: hex, border: `1px solid ${hex}60` }}>
                                  LIVE
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-bold" style={{ color: hex }}>
                                {isLive ? '' : '~'}{formatPrice(link.price)}
                              </span>
                              <span className="text-zinc-600 group-hover:text-zinc-300">↗</span>
                            </div>
                          </a>
                        ) : (
                          <div key={idx} className="flex justify-between items-center px-4 py-3 bg-zinc-900/30 border border-zinc-800/40 font-mono text-[10px] uppercase cursor-default">
                            <span className="font-bold text-zinc-600">{link.name}</span>
                            <span className="text-zinc-700">N/A</span>
                          </div>
                        );
                      };

                      return (
                        <div className="space-y-6 mb-12">
                          {/* MY SIZE INDICATOR */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 font-mono text-[9px] uppercase">
                              <span className="text-zinc-600">My Size:</span>
                              {mySize ? (
                                <>
                                  <span className="font-bold px-1.5 py-0.5" style={{ color: hex, border: `1px solid ${hex}50`, background: `${hex}15` }}>US {mySize}</span>
                                  <button onClick={() => handleSizeChange(mySize)} className="text-zinc-700 hover:text-red-400 transition-colors" title="Clear size">✕</button>
                                </>
                              ) : (
                                <span className="text-zinc-700">Not set — open [PARAMETERS] to set</span>
                              )}
                            </div>
                          </div>

                          {/* DISCLAIMER */}
                          <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-wide">
                            <span style={{ color: hex }}>LIVE</span> = indexed price from source. <span className="text-zinc-400">~</span> = estimated INR. StockX/GOAT prices are in USD.
                          </p>

                          {prices.desi.length > 0 && (
                            <div>
                              <h3 className="font-mono text-xs text-zinc-500 uppercase mb-2 pl-2 border-l-2 border-zinc-700">Domestic Sources (IN)</h3>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{prices.desi.map(renderLink)}</div>
                            </div>
                          )}
                          {prices.global.length > 0 && (
                            <div>
                              <h3 className="font-mono text-xs text-zinc-500 uppercase mb-2 pl-2 border-l-2 border-zinc-700">International Sources (GL)</h3>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{prices.global.map(renderLink)}</div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* ACTION BUTTONS */}
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => handleWhatsAppShare(selectedSneaker)}
                        className="py-4 border border-zinc-700 bg-zinc-900 hover:bg-green-900/20 hover:border-green-500 text-zinc-400 hover:text-green-400 font-mono text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 group"
                      >
                        <span>[ SHARE_WA ]</span>
                        <span className="group-hover:translate-x-1 transition-transform">↗</span>
                      </button>
                      <button
                        onClick={handleCopyLink}
                        className="py-4 border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-500 font-mono text-xs uppercase tracking-widest transition-all flex items-center justify-center"
                        style={{ color: copiedLink ? hex : undefined }}
                      >
                        {copiedLink ? '[ COPIED! ]' : '[ COPY_LINK ]'}
                      </button>
                      <button
                        onClick={generateReceipt}
                        className={`py-4 border border-zinc-700 bg-zinc-900 hover:bg-${theme}-900/20 hover:border-${theme}-500 text-zinc-400 hover:text-${theme}-400 font-mono text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 group`}
                      >
                        <span>[ RECEIPT ]</span>
                        <span className="group-hover:translate-x-1 transition-transform">↓</span>
                      </button>
                    </div>

                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      {/* PRICE DISCLAIMER */}
      <div className="w-full py-8 pb-24 flex justify-center">
        <p className="text-zinc-500 text-sm text-center max-w-lg">Prices are approximate and may vary. Always check the retailer site for the final price.</p>
      </div>

      </main>

      {/* FOOTER & THEME SWITCHER */}
      <footer className="fixed bottom-6 left-6 z-50 flex items-center gap-4">
        <div className="bg-zinc-900 w-10 h-10 flex items-center justify-center font-mono text-[10px] cursor-default transition-colors border" style={{ borderColor: `${hex}60`, color: hex }}>SP</div>
        
        {/* THEME TOGGLES */}
        <div className="flex gap-2 bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 p-2 rounded-full">
           <button onClick={() => handleThemeChange('blue')} className={`w-4 h-4 rounded-full bg-blue-500 border-2 transition-all ${theme === 'blue' ? 'border-white scale-110' : 'border-transparent opacity-50 hover:opacity-100'}`} title="Cyber Blue"></button>
           <button onClick={() => handleThemeChange('emerald')} className={`w-4 h-4 rounded-full bg-emerald-500 border-2 transition-all ${theme === 'emerald' ? 'border-white scale-110' : 'border-transparent opacity-50 hover:opacity-100'}`} title="Matrix Green"></button>
           <button onClick={() => handleThemeChange('amber')} className={`w-4 h-4 rounded-full bg-amber-500 border-2 transition-all ${theme === 'amber' ? 'border-white scale-110' : 'border-transparent opacity-50 hover:opacity-100'}`} title="Retro Amber"></button>
           <button onClick={() => handleThemeChange('rose')} className={`w-4 h-4 rounded-full bg-rose-500 border-2 transition-all ${theme === 'rose' ? 'border-white scale-110' : 'border-transparent opacity-50 hover:opacity-100'}`} title="System Red"></button>
        </div>
      </footer>

      {/* SOCIAL LINKS — visible only at bottom of page */}
      <div className={`fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 transition-all duration-500 ${atBottom ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        <p className="text-zinc-500 text-xs text-right max-w-[240px]">This project is free, I do not profit from it.</p>
        <div className="flex gap-2">
          <a href="https://www.instagram.com/parichay.p_/" target="_blank" rel="noopener noreferrer" className="social-icon w-[64px] h-[64px] flex items-center justify-center bg-[rgb(44,44,44)] rounded-[5px] cursor-pointer transition-all duration-300 hover:bg-[#d62976]" title="Instagram">
            <svg width="22" height="22" fill="white" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
          </a>
          <a href="https://in.pinterest.com/ParichayPrabhu/" target="_blank" rel="noopener noreferrer" className="social-icon w-[64px] h-[64px] flex items-center justify-center bg-[rgb(44,44,44)] rounded-[5px] cursor-pointer transition-all duration-300 hover:bg-[#E60023]" title="Pinterest">
            <svg width="22" height="22" fill="white" viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z"/></svg>
          </a>
          <a href="https://www.linkedin.com/in/parichay-prabhu-12328b228/" target="_blank" rel="noopener noreferrer" className="social-icon w-[64px] h-[64px] flex items-center justify-center bg-[rgb(44,44,44)] rounded-[5px] cursor-pointer transition-all duration-300 hover:bg-[#0072b1]" title="LinkedIn">
            <svg width="22" height="22" fill="white" viewBox="0 0 24 24"><path d="M4.98 3.5c0 1.381-1.11 2.5-2.48 2.5s-2.48-1.119-2.48-2.5c0-1.38 1.11-2.5 2.48-2.5s2.48 1.12 2.48 2.5zm.02 4.5H.02V24h5v-16zm7.982 0h-4.968V24h4.969v-8.399c0-4.67 6.029-5.052 6.029 0V24H24V13.869c0-7.88-8.922-7.593-11.018-3.714V8z"/></svg>
          </a>
        </div>
      </div>
    </div>
  );
}