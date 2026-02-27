import time
import json
import os
import re
import random
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

# ==========================================
# 1. CONFIGURATION
# ==========================================
OUTPUT_FILE = "sneaker_dump.txt"
MONGODB_URI = os.environ.get("MONGODB_URI", "")

# MongoDB client — set up once if URI is available
mongo_col = None
try:
    from pymongo import MongoClient, UpdateOne
    if MONGODB_URI:
        _client = MongoClient(MONGODB_URI)
        mongo_col = _client["sneakopedia"]["sneakers"]  # same db/collection as the app
        print(f"✅ MongoDB connected.")
    else:
        print("⚠️  MONGODB_URI not set — will save to file only.")
except ImportError:
    print("⚠️  pymongo not installed (pip install pymongo) — will save to file only.")

# ==========================================
# 2. SETUP DRIVER
# ==========================================
def setup_driver():
    options = Options()
    options.add_argument("--headless") # Runs in background
    options.add_argument("--window-size=1920,1080")
    options.add_argument("user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    driver = webdriver.Chrome(options=options)
    return driver

# ==========================================
# 3. HELPER FUNCTIONS
# ==========================================

# Words that appear near EMI / installment prices — skip any line containing these
_EMI_KEYWORDS = [
    'emi', 'per month', '/month', 'monthly', 'installment',
    'easy pay', 'no cost', 'x 3 ', 'x 6 ', 'x 9 ', 'x 12 ',
    'weeks', 'weekly', 'fortnight', 'bajaj', 'zest', 'cardless',
]

# Store suffixes to strip from og:title / page title
_STORE_SUFFIXES = [
    ' – Mainstreet', ' - Mainstreet',
    ' – Superkicks', ' - Superkicks', ' | Superkicks',
    ' – VegNonVeg',  ' - VegNonVeg',  ' | VegNonVeg',
    ' – Crepdog Crew',' - Crepdog Crew','| Crepdog Crew',
    ' | India', ' – India', ' - India',
    ' | Sneaker Street', ' - Sneaker Street',
    ' | SneakerStreet',
    ' | Shopify',
]

def _parse_price_str(raw):
    """Convert a raw price string like '17,999.00' or '17999' to int. Returns 0 on failure."""
    try:
        cleaned = re.sub(r'[^\d.]', '', str(raw))
        val = int(float(cleaned))
        if 2500 < val < 300000:
            return val
    except Exception:
        pass
    return 0

def extract_gtm_product(driver):
    """
    Extract full product data from Google Tag Manager data layer scripts.
    Pattern: var product = {"name":...,"price":...,"brand":...,"image":...}
    Used by custom headless frontends (e.g. VegNonVeg) that don't expose
    price in standard meta tags or JSON-LD.
    Returns a dict with any of: name, price, brand, image — or {} if not found.
    """
    best = {}
    try:
        scripts = driver.find_elements(By.TAG_NAME, "script")
        for script in scripts:
            content = script.get_attribute('innerHTML') or ''
            # Match: var product = { ... } or let googleProductViewed = { ... }
            for m in re.finditer(
                r'(?:var product|let google\w+)\s*=\s*(\{[^;]{20,2000}\})',
                content, re.DOTALL
            ):
                try:
                    data = json.loads(m.group(1))
                except Exception:
                    raw = re.sub(r',\s*([}\]])', r'\1', m.group(1))
                    try:
                        data = json.loads(raw)
                    except Exception:
                        continue

                if isinstance(data, dict):
                    if data.get('price') and not best.get('price'):
                        p = _parse_price_str(str(data['price']))
                        if p:
                            best['price'] = p
                    if data.get('name') and len(str(data['name'])) > 3 and not best.get('name'):
                        best['name'] = str(data['name']).strip()
                    if data.get('brand') and len(str(data['brand'])) > 1 and not best.get('brand'):
                        best['brand'] = str(data['brand']).strip()
                    if data.get('image') and str(data['image']).startswith('http') and not best.get('image'):
                        best['image'] = str(data['image']).split('?')[0]
    except Exception:
        pass
    return best


def extract_price(driver):
    """
    Priority-based price extraction:
      0. GTM data layer (custom headless frontends like VegNonVeg)
      1. JSON-LD Product offers.price  (most accurate)
      2. Meta product:price:amount / og:price:amount
      3. Shopify price CSS selectors
      4. Body text scan — EMI lines filtered out first
    Returns int rupees, or 0 if not found.
    """
    # 0. GTM data layer (highest priority for custom frontends)
    gtm = extract_gtm_product(driver)
    if gtm.get('price'):
        return gtm['price']

    # 1. JSON-LD
    try:
        scripts = driver.find_elements(By.CSS_SELECTOR, "script[type='application/ld+json']")
        for script in scripts:
            try:
                data = json.loads(script.get_attribute('innerHTML') or '{}')
                offers = None
                if isinstance(data, list):
                    for entry in data:
                        if isinstance(entry, dict) and entry.get('@type') == 'Product':
                            offers = entry.get('offers', {})
                            break
                elif data.get('@type') == 'Product':
                    offers = data.get('offers', {})
                if offers:
                    if isinstance(offers, list):
                        offers = offers[0]
                    price = _parse_price_str(offers.get('price', '0'))
                    if price:
                        return price
            except Exception:
                pass
    except Exception:
        pass

    # 2. Meta price tags
    for selector in [
        "meta[property='product:price:amount']",
        "meta[property='og:price:amount']",
        "meta[itemprop='price']",
    ]:
        try:
            meta = driver.find_element(By.CSS_SELECTOR, selector)
            price = _parse_price_str(meta.get_attribute('content'))
            if price:
                return price
        except Exception:
            pass

    # 3. Shopify / common price CSS selectors
    PRICE_SELECTORS = [
        ".price-item--sale",
        ".price-item--regular",
        ".price__current",
        ".product__price",
        ".product-meta__price",
        "[data-product-price]",
        "[data-price]",
        ".price",
    ]
    for sel in PRICE_SELECTORS:
        try:
            el = driver.find_element(By.CSS_SELECTOR, sel)
            text = el.text.strip()
            # Only accept lines that look like a price (contain ₹ or digits)
            nums = re.findall(r'[\d,]+', text.replace(',', ''))
            for n in nums:
                price = _parse_price_str(n)
                if price:
                    return price
        except Exception:
            pass

    # 4. Body text fallback — strip EMI lines first
    try:
        body_text = driver.find_element(By.TAG_NAME, "body").text
        clean_lines = []
        for line in body_text.split('\n'):
            low = line.lower()
            if not any(kw in low for kw in _EMI_KEYWORDS):
                clean_lines.append(line)

        # Prefer lines that have a rupee symbol — those are almost always real prices
        rupee_prices = []
        for line in clean_lines:
            if '₹' in line or 'Rs.' in line or 'INR' in line:
                nums = re.findall(r'[\d,]+', line)
                for n in nums:
                    price = _parse_price_str(n.replace(',', ''))
                    if price:
                        rupee_prices.append(price)

        if rupee_prices:
            # Among currency-prefixed prices, the minimum is almost always retail
            return min(rupee_prices)

        # No rupee symbol found — scan all clean lines, take minimum
        all_prices = []
        for line in clean_lines:
            nums = re.findall(r'[\d,]+', line)
            for n in nums:
                price = _parse_price_str(n.replace(',', ''))
                if price:
                    all_prices.append(price)
        if all_prices:
            return min(all_prices)
    except Exception:
        pass

    return 0


def extract_name(driver):
    """
    Priority-based name extraction:
      1. og:title meta tag  (product-specific, already cleaned by the store)
      2. JSON-LD Product name
      3. Shopify / product-specific h1 CSS selectors
      4. Generic h1
      5. Page title (stripped of store suffix)
    Returns a string.
    """
    # 1. og:title
    try:
        meta = driver.find_element(By.CSS_SELECTOR, "meta[property='og:title']")
        name = (meta.get_attribute('content') or '').strip()
        if name and len(name) > 4:
            for suffix in _STORE_SUFFIXES:
                name = name.replace(suffix, '')
            name = name.strip(' -–|')
            if name:
                return name
    except Exception:
        pass

    # 2. JSON-LD Product name
    try:
        scripts = driver.find_elements(By.CSS_SELECTOR, "script[type='application/ld+json']")
        for script in scripts:
            try:
                data = json.loads(script.get_attribute('innerHTML') or '{}')
                entries = data if isinstance(data, list) else [data]
                for entry in entries:
                    if isinstance(entry, dict) and entry.get('@type') == 'Product':
                        name = (entry.get('name') or '').strip()
                        if name and len(name) > 4:
                            return name
            except Exception:
                pass
    except Exception:
        pass

    # 3. Product-specific h1 selectors (Shopify / Dawn theme / common patterns)
    for sel in [
        "h1.product-meta__title",
        "h1.product__title",
        "h1[class*='product']",
        "h1[itemprop='name']",
    ]:
        try:
            el = driver.find_element(By.CSS_SELECTOR, sel)
            name = el.text.strip()
            if name and len(name) > 4:
                return name
        except Exception:
            pass

    # 4. Generic h1
    try:
        name = driver.find_element(By.TAG_NAME, "h1").text.strip()
        if name and len(name) > 4:
            return name
    except Exception:
        pass

    # 5. Page title fallback
    title = driver.title
    for sep in [' | ', ' – ', ' - ', ' — ']:
        title = title.split(sep)[0]
    return title.strip()


def normalize_brand(text, url=""):
    """
    Detect brand from shoe name text + optional product URL.
    URL-based detection handles D2C brands whose product names don't contain the brand name
    (e.g. Comet sells "X Lows FLAMINGO", Thaely sells "Sneaker 01").
    """
    # --- URL/domain-based detection (highest priority for D2C brands) ---
    url_lower = url.lower()
    if 'wearcomet.com'    in url_lower: return 'Comet'
    if 'thaely.com'       in url_lower: return 'Thaely'
    if 'gullylabs.com'    in url_lower: return 'Gully Labs'
    if 'gullylabs.in'     in url_lower: return 'Gully Labs'
    if '7-10.in'          in url_lower: return '7-10'
    if 'baccabucci.com'   in url_lower: return 'Bacca Bucci'

    text = text.lower()

    # --- Collabs / sub-brands (before parent brands) ---
    if 'yeezy'            in text: return 'Yeezy'
    if 'jordan'           in text: return 'Jordan'
    if 'on x loewe'       in text: return 'On Running'
    if 'naked wolfe'      in text: return 'Naked Wolfe'
    if 'louis vuitton'    in text: return 'Louis Vuitton'

    # --- Global brands ---
    if 'nike'             in text: return 'Nike'
    if 'adidas'           in text: return 'Adidas'
    if 'new balance'      in text: return 'New Balance'
    if 'converse'         in text: return 'Converse'
    if 'reebok'           in text: return 'Reebok'
    if 'under armour'     in text: return 'Under Armour'
    if 'asics'            in text: return 'Asics'
    if 'anta'             in text: return 'Anta'
    if 'brooks'           in text: return 'Brooks Running'
    if 'dior'             in text: return 'Dior'
    if 'fila'             in text: return 'Fila'
    if 'hoka'             in text: return 'Hoka'
    if 'li-ning'          in text: return 'Li-Ning'
    if 'onitsuka'         in text: return 'Onitsuka Tiger'
    if 'puma'             in text: return 'Puma'
    if 'salomon'          in text: return 'Salomon'
    if 'ugg'              in text: return 'UGG'
    if 'vans'             in text: return 'Vans'
    if 'crocs'            in text: return 'Crocs'
    if 'on running'       in text: return 'On Running'

    # Guard: "cloud" alone is too generic — only match if paired with "on" context
    # (avoid false match on "Air Max Cloud" etc.)
    if re.search(r'\bon cloud\b|\bcloudmonster\b|\bcloudnova\b|\bcloudflow\b', text):
        return 'On Running'

    # --- Indian D2C brands (text-based, when URL unavailable) ---
    if 'comet'            in text: return 'Comet'
    if 'thaely'           in text: return 'Thaely'
    if 'gully'            in text: return 'Gully Labs'
    if 'bacca bucci'      in text: return 'Bacca Bucci'

    return 'Streetwear'

# ==========================================
# 4. SINGLE PRODUCT SCRAPER
# ==========================================
def scrape_single_product(driver, url):
    """Scrapes a specific product page."""
    driver.get(url)
    time.sleep(5)

    try:
        # GTM data layer first — gives us name, price, brand, image in one shot
        # for headless frontends (VegNonVeg, etc.) that don't use standard meta tags
        gtm = extract_gtm_product(driver)

        name  = gtm.get('name') or extract_name(driver)
        price = gtm.get('price') or extract_price(driver)

        # --- IMAGE (Meta Strategy) ---
        img_src = gtm.get('image', "")
        if not img_src:
            try:
                meta_img = driver.find_element(By.CSS_SELECTOR, "meta[property='og:image']")
                img_src = meta_img.get_attribute("content")
            except Exception:
                try:
                    imgs = driver.find_elements(By.TAG_NAME, "img")
                    for i in imgs:
                        w = i.get_attribute("width")
                        if w and int(w) > 400:
                            img_src = i.get_attribute("src")
                            break
                except Exception:
                    pass

        # Clean image URL
        if img_src and img_src.startswith("//"): img_src = "https:" + img_src
        if img_src and "?" in img_src: img_src = img_src.split("?")[0]

        # Source domain for description
        try:
            from urllib.parse import urlparse
            source_domain = urlparse(url).netloc.replace("www.", "")
        except Exception:
            source_domain = url

        # GTM provides the canonical brand name (e.g. "ASICS") — use it if available
        brand = gtm.get('brand') or normalize_brand(name, url=url)

        item = {
            "_id":         f"s_{random.randint(10000,99999)}_{int(time.time())}",
            "shoeName":    name,
            "brand":       brand,
            "retailPrice": price,
            "currency":    "INR",
            "thumbnail":   img_src,
            "url":         url,
            "description": f"Sourced from {source_domain}",
            "rand":        random.random(),
        }

        if item.get("thumbnail") and item.get("retailPrice") > 0:
            print(f"   + Found: {item['shoeName']} (₹{item['retailPrice']})")
            return item
        else:
            print(f"   x Skipped (missing data — name: '{name}', price: {price}): {url}")
            return None

    except Exception as e:
        print(f"   x Error: {e}")
        return None

# ==========================================
# 5. COLLECTION SCRAPER
# ==========================================
def scrape_collection(driver, collection_url, pages=None):
    """Crawls a collection page, finds links, and scrapes them.
    Pass pages= to skip the interactive prompt (useful for batch/test mode).
    """
    print(f"\n--- 📦 DETECTED COLLECTION: {collection_url} ---")

    if pages is None:
        try:
            pages = int(input("   How many pages to scan? (e.g., 1, 2, 5): "))
        except Exception:
            pages = 1

    all_product_links = []

    # 1. GATHER LINKS
    for i in range(1, pages + 1):
        page_url = f"{collection_url}?page={i}"
        print(f"   > Scanning Page {i}...")
        driver.get(page_url)
        time.sleep(3)

        links = driver.find_elements(By.TAG_NAME, "a")
        count = 0
        for l in links:
            href = l.get_attribute("href")
            if href and "/products/" in href:
                if href not in all_product_links:
                    all_product_links.append(href)
                    count += 1
        print(f"     Found {count} products.")

    print(f"\n🚀 STARTING BULK SCRAPE ({len(all_product_links)} items found)...")

    scraped_data = []
    for idx, link in enumerate(all_product_links):
        print(f"   [{idx+1}/{len(all_product_links)}] Processing...", end="\r")
        data = scrape_single_product(driver, link)
        if data:
            scraped_data.append(data)
            time.sleep(2)  # Polite delay

    return scraped_data

# ==========================================
# 6. MAIN EXECUTION
# ==========================================
def scrape_url_list(driver, urls):
    """Scrape a pre-built list of product URLs. Used for batch file mode."""
    print(f"\n🚀 BATCH MODE — {len(urls)} URLs queued")
    results = []
    for idx, url in enumerate(urls):
        url = url.strip()
        if not url or url.startswith("#"):
            continue
        print(f"   [{idx+1}/{len(urls)}] {url[:80]}")
        data = scrape_single_product(driver, url)
        if data:
            results.append(data)
        time.sleep(2)
    return results


def main():
    print("==========================================")
    print("   SNEAKOPEDIA: HYBRID BOT V9.2")
    print("==========================================")
    print("   Tip: paste a .txt filename to scrape a list of URLs in batch.")

    driver = setup_driver()

    while True:
        print("\nPaste LINK, .txt FILE, or Collection URL. Type 'exit' to stop.")
        url = input("🔗 > ").strip()

        if url.lower() in ['exit', 'quit']:
            break

        if len(url) < 3: continue

        results = []

        # --- DECISION LOGIC ---
        if url.endswith(".txt"):
            # Batch file mode — each line is a product URL
            try:
                with open(url, "r", encoding="utf-8") as f:
                    batch_urls = [l.strip() for l in f if l.strip() and not l.startswith("#")]
                results = scrape_url_list(driver, batch_urls)
            except FileNotFoundError:
                print(f"   ❌ File not found: {url}")
                continue
        elif "/collections/" in url or "/search" in url:
            results = scrape_collection(driver, url)
        else:
            print("\n--- 👟 DETECTED SINGLE PRODUCT ---")
            data = scrape_single_product(driver, url)
            if data:
                results.append(data)

        # --- SAVE RESULTS ---
        if results:
            # Always write to file as backup
            print(f"\n💾 SAVING {len(results)} ITEMS TO FILE...")
            with open(OUTPUT_FILE, "a", encoding="utf-8") as f:
                for item in results:
                    json_str = json.dumps(item, indent=4)
                    f.write(json_str + ",\n")
            print("✅ File saved.")

            # Write to MongoDB if connected
            if mongo_col is not None:
                print(f"📡 UPLOADING {len(results)} ITEMS TO MONGODB...")
                ops = [
                    UpdateOne({"_id": item["_id"]}, {"$set": item}, upsert=True)
                    for item in results
                ]
                res = mongo_col.bulk_write(ops, ordered=False)
                print(f"✅ MongoDB: {res.upserted_count} inserted, {res.modified_count} updated.")

    driver.quit()

if __name__ == "__main__":
    main()
