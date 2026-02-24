import time
import json
import re
import random
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

# ==========================================
# 1. CONFIGURATION
# ==========================================
OUTPUT_FILE = "sneaker_dump.txt"

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
def extract_valid_prices(text):
    """Scans text for valid integer prices between 2500 and 300000."""
    if not text: return []
    matches = re.findall(r'[\d,]+', str(text))
    valid_prices = []
    for m in matches:
        clean = m.replace(',', '')
        if clean.isdigit():
            val = int(clean)
            if 2500 < val < 300000: 
                valid_prices.append(val)
    return valid_prices

def normalize_brand(text):
    text = text.lower()
    # High Priority (Specific Collabs/Sub-brands first)
    if 'yeezy' in text: return 'Yeezy'
    if 'jordan' in text: return 'Jordan'
    if 'on x loewe' in text: return 'On Running' # Group with On
    if 'on running' in text or 'cloud' in text: return 'On Running'
    if 'naked wolfe' in text: return 'Naked Wolfe'
    if 'louis vuitton' in text: return 'Louis Vuitton'
    if 'brooks' in text: return 'Brooks Running'
    if 'new balance' in text: return 'New Balance'
    if 'gully' in text: return 'Gully Labs'
    if '7-10' in text: return '7-10'

    # Standard Brands
    if 'nike' in text: return 'Nike'
    if 'adidas' in text: return 'Adidas'
    if 'asics' in text: return 'Asics'
    if 'anta' in text: return 'Anta'
    if 'dior' in text: return 'Dior'
    if 'fila' in text: return 'Fila'
    if 'hoka' in text: return 'Hoka'
    if 'li-ning' in text or 'lining' in text: return 'Li-Ning'
    if 'onitsuka' in text: return 'Onitsuka Tiger'
    if 'puma' in text: return 'Puma'
    if 'salomon' in text: return 'Salomon'
    if 'ugg' in text: return 'UGG'
    if 'vans' in text: return 'Vans'
    
    # Indian D2C / Others
    if 'comet' in text: return 'Comet'
    if 'crocs' in text: return 'Crocs'
    
    return 'Streetwear'

# ==========================================
# 4. SINGLE PRODUCT SCRAPER
# ==========================================
def scrape_single_product(driver, url):
    """Scrapes a specific product page."""
    driver.get(url)
    time.sleep(2) # Short wait

    item = {}
    try:
        # --- NAME ---
        try:
            name = driver.find_element(By.CSS_SELECTOR, "h1.product-meta__title").text.strip()
        except:
            try:
                name = driver.find_element(By.TAG_NAME, "h1").text.strip()
            except:
                name = driver.title.split('|')[0].strip()

        # --- PRICE (Nuclear Method) ---
        price = 0
        try:
            body_text = driver.find_element(By.TAG_NAME, "body").text
            found_prices = extract_valid_prices(body_text)
            if found_prices:
                price = min(found_prices)
        except:
            pass

        # --- IMAGE (Meta Strategy) ---
        img_src = ""
        try:
            meta_img = driver.find_element(By.CSS_SELECTOR, "meta[property='og:image']")
            img_src = meta_img.get_attribute("content")
        except:
            try:
                imgs = driver.find_elements(By.TAG_NAME, "img")
                for i in imgs:
                    w = i.get_attribute("width")
                    if w and int(w) > 400:
                        img_src = i.get_attribute("src")
                        break
            except:
                pass

        # Clean URL
        if img_src and img_src.startswith("//"): img_src = "https:" + img_src
        if img_src and "?" in img_src: img_src = img_src.split("?")[0]

        # Extract source domain for description
        try:
            from urllib.parse import urlparse
            source_domain = urlparse(url).netloc.replace("www.", "")
        except:
            source_domain = url

        item = {
            "_id": f"s_{random.randint(10000,99999)}_{int(time.time())}",
            "shoeName": name,
            "brand": normalize_brand(name),
            "retailPrice": price,
            "thumbnail": img_src,
            "url": url,
            "description": f"Sourced from {source_domain}"
        }

        # Validate
        if item.get("thumbnail") and item.get("retailPrice") > 0:
            print(f"   + Found: {item['shoeName']} (₹{item['retailPrice']})")
            return item
        else:
            print(f"   x Skipped (Missing Data): {url}")
            return None

    except Exception as e:
        print(f"   x Error: {e}")
        return None

# ==========================================
# 5. COLLECTION SCRAPER
# ==========================================
def scrape_collection(driver, collection_url):
    """Crawls a collection page, finds links, and scrapes them."""
    print(f"\n--- 📦 DETECTED COLLECTION: {collection_url} ---")
    
    try:
        pages = int(input("   How many pages to scan? (e.g., 1, 2, 5): "))
    except:
        pages = 1
        
    all_product_links = []
    
    # 1. GATHER LINKS
    for i in range(1, pages + 1):
        page_url = f"{collection_url}?page={i}"
        print(f"   > Scanning Page {i}...")
        driver.get(page_url)
        time.sleep(3)
        
        # Find all links that look like products
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
            # Polite sleep between requests
            time.sleep(2) 
            
    return scraped_data

# ==========================================
# 6. MAIN EXECUTION
# ==========================================
def main():
    print("==========================================")
    print("   SNEAKOPEDIA: HYBRID BOT V8.0")
    print("==========================================")
    
    driver = setup_driver()

    while True:
        print("\nPaste LINK (Collection OR Product). Type 'exit' to stop.")
        url = input("🔗 > ").strip()
        
        if url.lower() in ['exit', 'quit']:
            break
            
        if len(url) < 5: continue
        
        results = []
        
        # --- DECISION LOGIC ---
        if "/collections/" in url or "/search" in url:
            # It's a list of shoes -> Run Collection Scraper
            results = scrape_collection(driver, url)
        else:
            # It's a single shoe -> Run Single Scraper
            print("\n--- 👟 DETECTED SINGLE PRODUCT ---")
            data = scrape_single_product(driver, url)
            if data:
                results.append(data)
        
        # --- SAVE RESULTS ---
        if results:
            print(f"\n💾 SAVING {len(results)} ITEMS TO FILE...")
            with open(OUTPUT_FILE, "a", encoding="utf-8") as f:
                for item in results:
                    json_str = json.dumps(item, indent=4)
                    f.write(json_str + ",\n") 
            print("✅ SUCCESS! Data Saved.")

    driver.quit()

if __name__ == "__main__":
    main()