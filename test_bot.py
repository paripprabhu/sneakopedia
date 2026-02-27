"""
test_bot.py — Non-interactive test runner for sneaker_bot.py
Dynamically finds the first product from each store's collection, then scrapes it.
Run: python3 test_bot.py
"""

import time
import sys
import os
import re

sys.path.insert(0, os.path.dirname(__file__))

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from sneaker_bot import extract_name, extract_price, normalize_brand

# ──────────────────────────────────────────────────────────────────────────
# STORES TO TEST — collection URL + expected base domain for product links
# ──────────────────────────────────────────────────────────────────────────
STORES = [
    {
        "name":       "Crepdog Crew",
        # jordan sub-collection is shoes-only; longer wait for Shopify grid to hydrate
        "collection": "https://crepdogcrew.com/collections/jordan",
        "base":       "https://crepdogcrew.com",
        "wait":       6,
    },
    {
        "name":       "VegNonVeg",
        # VegNonVeg uses client-side rendering — try their /all collection with long wait + scroll
        "collection": "https://www.vegnonveg.com/collections/all",
        "base":       "vegnonveg.com",  # bare domain — links may omit www
        "scroll":     True,
        "wait":       8,
    },
    {
        "name":       "Mainstreet",
        "collection": "https://marketplace.mainstreet.co.in/collections/sneakers",
        "base":       "https://marketplace.mainstreet.co.in",
    },
    {
        "name":       "Superkicks",
        "collection": "https://www.superkicks.in/collections/sneakers",
        "base":       "https://www.superkicks.in",
    },
    {
        "name":       "Comet",
        "collection": "https://www.wearcomet.com/collections/all",
        "base":       "https://www.wearcomet.com",
    },
    {
        "name":       "Thaely",
        "collection": "https://thaely.com/collections/all",
        "base":       "https://thaely.com",
    },
    {
        "name":       "Gully Labs",
        "collection": "https://www.gullylabs.com/collections/all",
        "base":       "https://www.gullylabs.com",
    },
]

# URL slugs that should be skipped — not sneakers
_NON_SHOE_SLUGS = [
    "gift-card", "giftcard", "shirt", "tee", "hoodie", "cap", "hat",
    "socks", "accessories", "keychain", "bag", "tracker", "strap",
    "watch", "wristband", "apparel", "clothing",
    # drinkware / collectibles
    "tumbler", "cup", "glass", "mug", "bottle", "drinkware",
    "plush", "toy", "figure", "poster", "art",
    # shoe care / cleaning
    "wipes", "cleaner", "care", "brush", "spray", "deodorizer",
    # laces / insoles / other add-ons
    "laces", "lace", "insole", "sole-swap",
    # other common non-shoe slugs
    "umbrella", "protection", "cover",
]

PASS = "✅ PASS"
FAIL = "❌ FAIL"
WARN = "⚠️  WARN"


def setup_driver():
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument(
        "user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    return webdriver.Chrome(options=options)


def find_first_product(driver, collection_url, base_domain, scroll=False, wait=4):
    """
    Load a collection page and return the first /products/ link that looks like a shoe.
    scroll=True triggers JS scroll to handle lazy-loading stores (e.g. VegNonVeg).
    Returns None if none found.
    """
    try:
        driver.get(collection_url)
        time.sleep(wait)

        if scroll:
            # Scroll down to trigger lazy-loaded product grid
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight / 2);")
            time.sleep(3)
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(2)

        links = driver.find_elements(By.TAG_NAME, "a")
        bare_base = base_domain.replace("https://", "").replace("http://", "").replace("www.", "")
        seen = set()
        for el in links:
            href = el.get_attribute("href") or ""
            if "/products/" not in href:
                continue
            if bare_base not in href:
                continue
            href = href.split("?")[0].split("#")[0]
            if href in seen:
                continue
            seen.add(href)
            # Skip non-shoe products
            slug = href.split("/products/")[-1].lower()
            if any(bad in slug for bad in _NON_SHOE_SLUGS):
                continue
            return href
    except Exception as e:
        print(f"     [collection scan error: {e}]")
    return None


def test_store(driver, store):
    result = {
        "store":        store["name"],
        "product_url":  "",
        "name":         "",
        "price":        0,
        "brand":        "",
        "status":       FAIL,
        "note":         "",
    }

    # Step 1 — find a live product URL from the collection
    print(f"     Scanning collection...", end=" ", flush=True)
    product_url = find_first_product(driver, store["collection"], store["base"], scroll=store.get("scroll", False), wait=store.get("wait", 4))

    if not product_url:
        result["status"] = WARN
        result["note"]   = "No /products/ links found on collection page"
        print("no product links found")
        return result

    result["product_url"] = product_url
    print(f"found {product_url}")

    # Step 2 — scrape the product page
    try:
        driver.get(product_url)
        time.sleep(5)

        page_title = driver.title.lower()
        if "404" in page_title or "not found" in page_title:
            result["status"] = WARN
            result["note"]   = "Product URL returned 404"
            return result

        name  = extract_name(driver)
        price = extract_price(driver)
        brand = normalize_brand(name, url=product_url)

        result["name"]  = name
        result["price"] = price
        result["brand"] = brand

        if name and price > 0:
            result["status"] = PASS
        elif name and price == 0:
            result["status"] = WARN
            result["note"]   = "Name OK — price extraction failed"
        elif price > 0:
            result["status"] = WARN
            result["note"]   = "Price OK — name extraction failed"
        else:
            result["note"] = "Both name and price failed"

    except Exception as e:
        result["status"] = FAIL
        result["note"]   = str(e)[:120]

    return result


def print_table(results):
    W = [14, 45, 10, 14, 9, 40]
    headers = ["Store", "Name", "Price (₹)", "Brand", "Status", "Note"]

    def row(cols):
        return " | ".join(str(c)[:W[i]].ljust(W[i]) for i, c in enumerate(cols))

    sep = "-+-".join("-" * w for w in W)
    total_w = sum(W) + 3 * (len(W) - 1)
    print("\n" + "=" * total_w)
    print("  SNEAKOPEDIA BOT — TEST RESULTS")
    print("=" * total_w)
    print(row(headers))
    print(sep)
    for r in results:
        print(row([
            r["store"],
            r["name"] or "(none)",
            f"₹{r['price']:,}" if r["price"] else "—",
            r["brand"],
            r["status"],
            r["note"],
        ]))
    print(sep)

    passes = sum(1 for r in results if r["status"] == PASS)
    warns  = sum(1 for r in results if r["status"] == WARN)
    fails  = sum(1 for r in results if r["status"] == FAIL)
    print(f"\n  {passes} passed  |  {warns} warnings  |  {fails} failed  (of {len(results)} stores)\n")

    for r in results:
        if r["product_url"]:
            print(f"  {r['store']:14s} → {r['product_url']}")
    print()


if __name__ == "__main__":
    print("\n🚀 Sneakopedia Bot Test (dynamic URL discovery)")
    print("   Chrome + Selenium Manager will auto-resolve ChromeDriver\n")

    driver = setup_driver()
    results = []

    for store in STORES:
        print(f"\n── {store['name']} ──")
        r = test_store(driver, store)
        print(f"   {r['status']}  {r['name'] or ''}  {('₹' + str(r['price'])) if r['price'] else ''}")
        results.append(r)

    driver.quit()
    print_table(results)
