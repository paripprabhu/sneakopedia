"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================================
// COMPONENT 1: IDLE SCREENSAVER (DVD LOGO STYLE)
// ============================================================================
const IdleScreen = ({ theme }: { theme: string }) => {
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [velocity, setVelocity] = useState({ x: 2, y: 2 });
  
  // Dynamic color based on theme
  const colorClass = `text-${theme}-500`;

  useEffect(() => {
    const move = setInterval(() => {
      setPosition((prev) => {
        let newX = prev.x + velocity.x;
        let newY = prev.y + velocity.y;
        let newVelX = velocity.x;
        let newVelY = velocity.y;
        let hit = false;

        // Bounce X
        if (newX <= 0 || newX >= window.innerWidth - 300) {
          newVelX = -velocity.x;
          hit = true;
        }
        // Bounce Y
        if (newY <= 0 || newY >= window.innerHeight - 50) {
          newVelY = -velocity.y;
          hit = true;
        }

        if (hit) {
          setVelocity({ x: newVelX, y: newVelY });
        }
        return { x: newX, y: newY };
      });
    }, 16); // 60fps

    return () => clearInterval(move);
  }, [velocity]);

  return (
    <div className="fixed inset-0 bg-black z-[100] cursor-none overflow-hidden flex items-center justify-center">
      <div 
        className={`absolute font-black text-6xl tracking-tighter uppercase ${colorClass}`}
        style={{ left: position.x, top: position.y }}
      >
        SNEAKOPEDIA
      </div>
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-zinc-800 font-mono text-xs animate-pulse">
        /// SYSTEM_IDLE /// MOVE_MOUSE_TO_RESUME
      </div>
    </div>
  );
};

// ============================================================================
// COMPONENT 2: BOOT SEQUENCE (HACKER TERMINAL)
// ============================================================================
const BootScreen = ({ onComplete, theme }: { onComplete: () => void, theme: string }) => {
  const [lines, setLines] = useState<string[]>([]);
  
  const bootText = [
    "INITIALIZING KERNEL...",
    "LOADING MEMORY MODULES... OK",
    "MOUNTING SNEAKER_DB VOLUME...",
    "ESTABLISHING SECURE CONNECTION...",
    "BYPASSING PROXY FIREWALL...",
    "FETCHING MARKET DATA...",
    "RENDERING HOLOGRAPHIC ASSETS...",
    "SYSTEM_ACCESS_GRANTED."
  ];

  useEffect(() => {
    let delay = 0;
    bootText.forEach((line, index) => {
      delay += Math.random() * 300 + 100; // Random typing speed
      setTimeout(() => {
        setLines(prev => [...prev, line]);
        // Finish when last line is done
        if (index === bootText.length - 1) {
           setTimeout(onComplete, 800);
        }
      }, delay);
    });
  }, []);

  return (
    <div className={`fixed inset-0 bg-black z-[100] flex flex-col justify-end p-10 font-mono text-xs md:text-sm text-${theme}-500 cursor-wait`}>
       <div className="max-w-2xl w-full mx-auto space-y-1">
         {lines.map((line, i) => (
           <div key={i} className="flex gap-2">
             <span className="text-zinc-600">[{new Date().toLocaleTimeString()}]</span>
             <span className={i === lines.length - 1 ? "animate-pulse text-white" : `text-${theme}-400`}>{line}</span>
           </div>
         ))}
         <div className={`h-4 w-3 bg-${theme}-500 animate-pulse mt-2`}></div>
       </div>
    </div>
  );
};

// ============================================================================
// COMPONENT 3: MAIN APP
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
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  
  const [selectedSneaker, setSelectedSneaker] = useState<any>(null);
  const [recentViewed, setRecentViewed] = useState<any[]>([]);

  // Filter & Boot State
  const [showFilters, setShowFilters] = useState(false);
  const [showGrails, setShowGrails] = useState(false); // Controls Right Sidebar
  const [priceRange, setPriceRange] = useState(200000); 
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [showBoot, setShowBoot] = useState(true);

  // Idle Timer State
  const [isIdle, setIsIdle] = useState(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Grail Data State
  const [grails, setGrails] = useState<any[]>([]); 

  // Theme State
  const [theme, setTheme] = useState('blue'); 

  // --- EXTENSIVE BRAND LIST (FULL LIST) ---
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
    "Palace", "Stussy", "Travis Scott", "OVO", "Nocta"
  ];

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

  // --- HELPER: FALLBACK LOGOS ---
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

  // --- HELPER: IMAGE PROXY ---
  const getSafeImage = (sneaker: any) => {
    const url = sneaker.thumbnail;
    const brand = sneaker.brand;

    if (!url || url === "") {
      return getFallbackLogo(brand);
    }
    if (url.includes('crepdogcrew') || url.includes('cdn.shopify.com')) {
      return `https://wsrv.nl/?url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  // --- HELPER: CURRENCY ---
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', { 
      style: 'currency', 
      currency: 'INR', 
      maximumFractionDigits: 0 
    }).format(price);
  };

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

  // --- IDLE TIMER SYSTEM ---
  const resetIdleTimer = () => {
    setIsIdle(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setIsIdle(true);
    }, 60000); // 60 Seconds
  };

  useEffect(() => {
    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);
    window.addEventListener('scroll', resetIdleTimer);
    
    resetIdleTimer(); 

    return () => {
      window.removeEventListener('mousemove', resetIdleTimer);
      window.removeEventListener('keydown', resetIdleTimer);
      window.removeEventListener('scroll', resetIdleTimer);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  // --- INITIALIZATION & EFFECTS ---
  useEffect(() => {
    const hasBooted = sessionStorage.getItem('sneakopedia_booted');
    if (hasBooted) {
      setShowBoot(false);
    }
    
    // Load History
    const saved = localStorage.getItem('sneakopedia_history');
    if (saved) {
      try {
        setRecentViewed(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load history");
      }
    }

    // Load Grails
    const savedGrails = localStorage.getItem('sneakopedia_grails');
    if (savedGrails) {
      try {
        setGrails(JSON.parse(savedGrails));
      } catch (e) {
        console.error("Failed to load grails");
      }
    }

    // Load Theme
    const savedTheme = localStorage.getItem('sneakopedia_theme');
    if (savedTheme) {
      setTheme(savedTheme);
    }
    
    // Deep Linking Check
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) {
       fetch(`/api/sneakers?id=${id}`)
         .then(res => res.json())
         .then(data => {
            if (data && data.length > 0) setSelectedSneaker(data[0]);
            else if (data.data && data.data.length > 0) setSelectedSneaker(data.data[0]);
         });
    }
  }, []);

  const handleBootComplete = () => {
    sessionStorage.setItem('sneakopedia_booted', 'true');
    setShowBoot(false);
  };

  // --- URL SYNC & HISTORY ---
  useEffect(() => {
    if (selectedSneaker) {
      setImageLoading(true); 
      
      const newUrl = `${window.location.pathname}?id=${selectedSneaker._id}`;
      window.history.pushState({ path: newUrl }, '', newUrl);

      setRecentViewed(prev => {
        const filtered = prev.filter(s => s._id !== selectedSneaker._id); 
        const updated = [selectedSneaker, ...filtered].slice(0, 4); 
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
      });
      if (selectedBrands.length > 0) {
        params.append('brands', selectedBrands.join(','));
      }

      const res = await fetch(`/api/sneakers?${params.toString()}`);
      const data = await res.json();

      setSneakers(data.data || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalItems(data.pagination?.totalItems || 0);
    } catch (error) {
      console.error("Fetch error", error);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, sortType, currentPage, priceRange, selectedBrands]);

  useEffect(() => {
    fetchSneakers();
  }, [fetchSneakers]);

  // --- HANDLERS ---
  const handleLogoClick = () => {
    setSelectedSneaker(null);
    setSearchInput('');
    setSortType('none');
    setPriceRange(200000);
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

  const handleBackgroundClick = (e: React.MouseEvent) => {
    setSelectedSneaker(null);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleRandomizer = async () => {
    if (!selectedSneaker) setLoading(true); 
    try {
      const res = await fetch(`/api/sneakers?random=true`);
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

  // --- LINK GENERATION (FULL LOGIC RESTORED - NO COMPRESSION) ---
  const getLinks = (sneakerName: string, brand: string) => {
    const query = encodeURIComponent(sneakerName);
    const b = brand ? brand.toLowerCase() : '';
    
    // SPECIFIC INDIAN D2C BRAND LOGIC
    if (b.includes('comet')) {
        return { 
            desi: [{ name: "Comet Official", url: `https://www.wearcomet.com/search?q=${query}` }], 
            global: [] 
        };
    }
    if (b.includes('thaely')) {
        return { 
            desi: [{ name: "Thaely Official", url: `https://thaely.com/search?q=${query}` }], 
            global: [] 
        };
    }
    if (b.includes('gully') || b.includes('gully labs')) {
        return { 
            desi: [{ name: "Gully Labs", url: `https://www.gullylabs.com/search?q=${query}` }], 
            global: [] 
        };
    }
    if (b.includes('7-10') || b.includes('7 10')) {
        return { 
            desi: [{ name: "7-10 Official", url: `https://www.7-10.in/search?q=${query}` }], 
            global: [] 
        };
    }
    if (b.includes('bacca') || b.includes('bucci')) {
        return { 
            desi: [{ name: "Bacca Bucci", url: `https://baccabucci.com/search?q=${query}` }], 
            global: [] 
        };
    }

    // STANDARD MARKETPLACE LOGIC
    return {
      desi: [
        { name: "Mainstreet", url: `https://marketplace.mainstreet.co.in/search?q=${query}` },
        { name: "VegNonVeg", url: `https://www.vegnonveg.com/search?q=${query}` },
        { name: "Superkicks", url: `https://www.superkicks.in/search?q=${query}` },
        { name: "Crepdog Crew", url: `https://crepdogcrew.com/search?q=${query}` },
        { name: "SoleSearch", url: `https://www.solesearchindia.com/search?q=${query}` },
        { name: "Footlocker IN", url: `https://www.footlocker.co.in/search?q=${query}` },
      ],
      global: [
        { name: "StockX", url: `https://stockx.com/search?s=${query}` },
        { name: "GOAT", url: `https://www.goat.com/search?query=${query}` },
      ]
    };
  };

  // ============================================================================
  // RENDER UI
  // ============================================================================
  return (
    <div className={`min-h-screen bg-[#09090b] text-zinc-100 font-sans selection:bg-${theme}-500 selection:text-white relative overflow-x-hidden pb-32`}>
      
      {/* 1. OVERLAYS */}
      {showBoot && <BootScreen onComplete={handleBootComplete} theme={theme} />}
      {isIdle && !showBoot && <IdleScreen theme={theme} />}

      {/* 2. GLOBAL STYLES (Dynamic Theme Injection) */}
      <style jsx global>{`
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .animate-marquee { animation: marquee 30s linear infinite; }
        
        /* HOLOGRAPHIC SHIMMER */
        @keyframes holo {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .holo-border {
          background: linear-gradient(270deg, #333, #555, ${theme === 'blue' ? '#00f' : theme === 'emerald' ? '#0f0' : theme === 'amber' ? '#f59e0b' : '#ef4444'}, #fff, #333);
          background-size: 400% 400%;
          animation: holo 3s ease infinite;
        }
      `}</style>

      {/* 3. BACKGROUND GRID */}
      <div className="fixed inset-0 pointer-events-none opacity-20" 
           style={{ backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
      </div>

      {/* 4. NAVBAR (FIXED TOP) */}
      <nav className={`fixed top-0 w-full z-50 px-6 py-4 flex items-start justify-between bg-[#09090b]/80 backdrop-blur-sm border-b border-zinc-800/50 transition-all duration-1000 ${showBoot ? 'opacity-0' : 'opacity-100'}`}>
        <div onClick={handleLogoClick} className="cursor-pointer group flex items-center gap-3 pt-1">
           <div className={`w-2 h-2 bg-${theme}-500 rounded-full animate-pulse`}></div>
           <span className="font-mono text-xs font-bold tracking-widest text-zinc-400 group-hover:text-white uppercase">
             System_Access // Home
           </span>
        </div>
        
        <div className="flex items-center gap-4">
            {/* RANDOM BUTTON */}
            <button 
              onClick={handleRandomizer}
              disabled={loading && !selectedSneaker}
              className={`hidden md:flex items-center gap-2 px-4 py-1.5 border border-zinc-700 bg-zinc-900/50 hover:bg-${theme}-900/20 hover:border-${theme}-500/50 transition-all group rounded disabled:opacity-50 disabled:cursor-wait`}
            >
              <span className={`font-mono text-[10px] text-zinc-400 group-hover:text-${theme}-300 uppercase tracking-wider`}>
                {loading ? '[ PROCESSING... ]' : '[ RANDOM_ACCESS ]'}
              </span>
            </button>

            {/* GRAIL LOCKER BUTTON (NEW) */}
            <button 
              onClick={() => setShowGrails(!showGrails)}
              className={`hidden md:flex items-center gap-2 px-4 py-1.5 border transition-all group rounded ${
                showGrails 
                  ? `border-${theme}-500 bg-${theme}-900/20 text-white` 
                  : `border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-${theme}-500/50`
              }`}
            >
              <span className="font-mono text-[10px] uppercase tracking-wider">
                [ GRAIL_LOCKER ({grails.length}) ]
              </span>
            </button>
        </div>
      </nav>

      {/* 5. FILTER SIDEBAR (LEFT) */}
      <aside className={`fixed top-0 left-0 h-full bg-[#0d0d0d] border-r border-zinc-800 z-[55] transition-all duration-300 ease-in-out pt-32 px-6 overflow-y-auto ${showFilters ? 'w-80 translate-x-0 shadow-2xl' : 'w-0 -translate-x-full opacity-0'}`}>
        <div className="min-w-[280px]">
           <div className="flex justify-between items-center mb-8">
             <h2 className={`font-mono text-sm text-${theme}-500 font-bold uppercase tracking-wider`}>/// PARAMETERS</h2>
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
               max="200000" 
               step="1000"
               value={priceRange} 
               onChange={(e) => setPriceRange(parseInt(e.target.value))}
               className={`w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-${theme}-500`}
             />
             <div className="flex justify-between mt-2 font-mono text-[9px] text-zinc-600">
                <span>0</span>
                <span>2L+</span>
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
             onClick={() => { setSelectedBrands([]); setPriceRange(200000); }}
             className="w-full mt-12 py-3 border border-red-900/50 text-red-500 hover:bg-red-900/20 font-mono text-[10px] uppercase"
           >
             RESET_ALL_SYSTEMS
           </button>
        </div>
      </aside>

      {/* 6. GRAIL SIDEBAR (RIGHT) - NEW */}
      <aside className={`fixed top-0 right-0 h-full bg-[#0d0d0d] border-l border-zinc-800 z-[55] transition-all duration-300 ease-in-out pt-32 px-6 overflow-y-auto ${showGrails ? 'w-80 translate-x-0 shadow-2xl' : 'w-0 translate-x-full opacity-0'}`}>
         <div className="min-w-[280px]">
           <div className="flex justify-between items-center mb-8">
             <h2 className={`font-mono text-sm text-${theme}-500 font-bold uppercase tracking-wider`}>/// GRAIL_LOCKER</h2>
             <button onClick={() => setShowGrails(false)} className="text-zinc-500 hover:text-white">✕</button>
           </div>
           
           {grails.length === 0 ? (
             <div className="text-zinc-600 font-mono text-xs uppercase text-center mt-20">Locker Empty.</div>
           ) : (
             <div className="space-y-4">
               {grails.map((g) => (
                 <div 
                   key={g._id} 
                   onClick={() => setSelectedSneaker(g)}
                   className={`flex gap-4 p-2 bg-zinc-900/50 border border-zinc-800 hover:border-${theme}-500 cursor-pointer group`}
                 >
                   <div className="w-16 h-16 bg-zinc-800 flex items-center justify-center overflow-hidden">
                     <img src={getSafeImage(g)} className="w-full h-full object-cover mix-blend-screen" />
                   </div>
                   <div className="flex-1">
                     <h4 className="font-bold text-[10px] text-zinc-300 uppercase line-clamp-1 group-hover:text-white">{g.shoeName}</h4>
                     <p className={`font-mono text-${theme}-400 text-[10px]`}>{formatPrice(g.retailPrice)}</p>
                   </div>
                 </div>
               ))}
             </div>
           )}
         </div>
      </aside>

      {/* 7. MAIN CONTENT AREA */}
      <main className={`relative flex flex-col items-center justify-center min-h-screen px-4 py-32 z-10 transition-all duration-1000 ${showBoot ? 'opacity-0 blur-sm' : 'opacity-100 blur-0'}`} style={{ paddingLeft: showFilters ? '320px' : '1rem', paddingRight: showGrails ? '320px' : '1rem' }}>
        
        {!selectedSneaker ? (
          
          /* --- A. HOME VIEW (GRID) --- */
          <div className="w-full max-w-[1400px] flex flex-col items-center animate-in fade-in duration-500">
            
            {/* HERO */}
            <div className="text-center space-y-6 mb-16 relative z-10 flex flex-col items-center w-full mt-8">
              <h1 onClick={handleLogoClick} className="cursor-pointer text-6xl md:text-9xl font-black tracking-tighter text-white hover:text-zinc-300 transition-colors uppercase leading-[0.8]">
                SNEAKOPEDIA
              </h1>
              <p className="font-mono text-zinc-500 text-xs md:text-sm uppercase tracking-widest underline decoration-blue-900 underline-offset-8">
                The Ultimate Sneaker Archive // Database {totalItems > 0 && `(${totalItems} Indexed)`}
              </p>
            </div>
            
            {/* CONTROLS */}
            <div className="w-full max-w-4xl mb-24 grid md:grid-cols-4 gap-4">
              
              {/* FILTER BUTTON */}
              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center justify-center gap-2 border font-mono text-[10px] uppercase tracking-wider transition-all ${showFilters ? `bg-${theme}-900/20 border-${theme}-500 text-white` : `bg-[#0d0d0d] border-zinc-700 text-zinc-400 hover:text-white`}`}
              >
                <span>{showFilters ? '[-]' : '[+]'}</span> PARAMETERS
              </button>

              <div className={`md:col-span-2 flex items-center bg-[#0d0d0d] border border-zinc-700 focus-within:border-${theme}-500 transition-all rounded-sm`}>
                <span className="pl-4 font-mono text-zinc-500">{'>'}</span>
                <input 
                  type="text" 
                  placeholder="SEARCH_ARCHIVE..."
                  value={searchInput}
                  onChange={handleSearchChange}
                  className="w-full bg-transparent border-none px-4 py-4 text-lg text-white placeholder-zinc-600 focus:outline-none font-mono uppercase"
                />
              </div>

              <div className={`flex items-center bg-[#0d0d0d] border border-zinc-700 rounded-sm px-2 group hover:border-${theme}-500 transition-colors`}>
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
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 w-full animate-in slide-in-from-bottom-8">
                  {sneakers.map((sneaker: any, index: number) => (
                    
                    /* HOLOGRAPHIC CARD */
                    <div 
                      key={sneaker._id}
                      onClick={() => setSelectedSneaker(sneaker)}
                      className="group relative p-[1px] cursor-pointer h-full overflow-hidden"
                    >
                      {/* BORDER */}
                      <div className="absolute inset-0 bg-zinc-800 group-hover:holo-border transition-all duration-300"></div>
                      
                      {/* CONTENT */}
                      <div className="relative flex flex-col bg-[#111] h-full">
                        <div className="flex justify-between items-center p-3 border-b border-zinc-800 bg-zinc-900/30">
                           <span className="font-mono text-[9px] text-zinc-500 uppercase line-clamp-1">{sneaker.brand}</span>
                           <div className={`w-1 h-1 bg-zinc-700 rounded-full group-hover:bg-${theme}-500`}></div>
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
                  <div className="flex items-center gap-4 mt-20 border border-zinc-800 bg-zinc-900 px-6 py-3">
                    <button 
                      onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); window.scrollTo({top:0, behavior:'smooth'}); }} 
                      disabled={currentPage === 1} 
                      className="text-zinc-400 hover:text-white disabled:opacity-30 text-xs font-mono"
                    >
                      {'< PREV'}
                    </button>
                    <span className="font-mono text-zinc-300 text-xs tracking-tighter">PAGE {currentPage} / {totalPages}</span>
                    <button 
                      onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); window.scrollTo({top:0, behavior:'smooth'}); }} 
                      disabled={currentPage === totalPages} 
                      className="text-zinc-400 hover:text-white disabled:opacity-30 text-xs font-mono"
                    >
                      {'NEXT >'}
                    </button>
                  </div>
                )}
              </>
            ) : (
               <div className="mt-12 text-zinc-500 font-mono text-xs uppercase border border-zinc-800 p-8">
                 {debouncedSearch ? "No Results Found in Archive" : "System Ready. Awaiting Input."}
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
              <button 
                onClick={() => setSelectedSneaker(null)} 
                className={`text-zinc-500 hover:text-${theme}-500 mb-8 font-mono text-xs uppercase tracking-widest flex items-center gap-2 group`}
              >
                <span className="group-hover:-translate-x-1 transition-transform">←</span> Return to Index
              </button>

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
                       <span className="font-mono text-zinc-500 text-xs uppercase tracking-tighter">Verified_Market_Value</span>
                       <span className={`text-3xl font-mono font-bold text-${theme}-500`}>{formatPrice(selectedSneaker.retailPrice)}</span>
                    </div>

                    {/* LINKS */}
                    <div className="space-y-8 mb-12">
                       <div>
                          <h3 className="font-mono text-xs text-zinc-500 uppercase mb-2 pl-2 border-l-2 border-zinc-700">Domestic Sources (IN)</h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {getLinks(selectedSneaker.shoeName, selectedSneaker.brand).desi.map((link: any, idx: number) => (
                              <a key={idx} href={link.url} target="_blank" className={`flex justify-between px-4 py-3 bg-zinc-900 border border-zinc-800 hover:border-${theme}-500 font-mono text-[10px] uppercase group transition-all`}>
                                <span className="font-bold text-zinc-300 group-hover:text-white">{link.name}</span>
                                <span className={`text-zinc-600 group-hover:text-${theme}-500`}>↗</span>
                              </a>
                            ))}
                          </div>
                       </div>
                       
                       {getLinks(selectedSneaker.shoeName, selectedSneaker.brand).global.length > 0 && (
                         <div>
                            <h3 className="font-mono text-xs text-zinc-500 uppercase mb-2 pl-2 border-l-2 border-zinc-700">International Sources (GL)</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {getLinks(selectedSneaker.shoeName, selectedSneaker.brand).global.map((link: any, idx: number) => (
                                <a key={idx} href={link.url} target="_blank" className={`flex justify-between px-4 py-3 bg-zinc-900 border border-zinc-800 hover:border-${theme}-500 font-mono text-[10px] uppercase group transition-all`}>
                                  <span className="font-bold text-zinc-300 group-hover:text-white">{link.name}</span>
                                  <span className={`text-zinc-600 group-hover:text-${theme}-500`}>↗</span>
                                </a>
                              ))}
                            </div>
                         </div>
                       )}
                    </div>

                    {/* RECEIPT BUTTON (MOVED TO BOTTOM) */}
                    <button 
                      onClick={generateReceipt}
                      className={`w-full py-4 border border-zinc-700 bg-zinc-900 hover:bg-${theme}-900/20 hover:border-${theme}-500 text-zinc-400 hover:text-${theme}-400 font-mono text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 group`}
                    >
                      <span>[ GENERATE_DIGITAL_RECEIPT ]</span>
                      <span className="group-hover:translate-x-1 transition-transform">↓</span>
                    </button>

                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      
      {/* FOOTER & THEME SWITCHER */}
      <footer className="fixed bottom-6 left-6 z-50 flex items-center gap-4">
        <div className={`bg-zinc-900 border border-zinc-800 w-10 h-10 flex items-center justify-center text-zinc-500 font-mono text-[10px] cursor-default hover:text-white hover:border-${theme}-500 transition-colors`}>SP</div>
        
        {/* THEME TOGGLES */}
        <div className="flex gap-2 bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 p-2 rounded-full">
           <button onClick={() => handleThemeChange('blue')} className={`w-4 h-4 rounded-full bg-blue-500 border-2 transition-all ${theme === 'blue' ? 'border-white scale-110' : 'border-transparent opacity-50 hover:opacity-100'}`} title="Cyber Blue"></button>
           <button onClick={() => handleThemeChange('emerald')} className={`w-4 h-4 rounded-full bg-emerald-500 border-2 transition-all ${theme === 'emerald' ? 'border-white scale-110' : 'border-transparent opacity-50 hover:opacity-100'}`} title="Matrix Green"></button>
           <button onClick={() => handleThemeChange('amber')} className={`w-4 h-4 rounded-full bg-amber-500 border-2 transition-all ${theme === 'amber' ? 'border-white scale-110' : 'border-transparent opacity-50 hover:opacity-100'}`} title="Retro Amber"></button>
           <button onClick={() => handleThemeChange('rose')} className={`w-4 h-4 rounded-full bg-rose-500 border-2 transition-all ${theme === 'rose' ? 'border-white scale-110' : 'border-transparent opacity-50 hover:opacity-100'}`} title="System Red"></button>
        </div>
      </footer>
    </div>
  );
}