"""
vnv_extractor.py — VegNonVeg product URL extractor (sitemap-based)

VegNonVeg uses a custom headless Shopify frontend whose collection pages
don't expose /products/ links in the DOM (they use JS-rendered custom routes).
Shopify always generates a machine-readable sitemap at /sitemap.xml, so we
bypass the frontend entirely and pull every product URL directly from there.

Output: vnv_links.txt — one URL per line, ready for sneaker_bot.py batch mode.
Run:    python3 vnv_extractor.py
Feed to bot: paste "vnv_links.txt" into sneaker_bot.py prompt
"""

import requests
import xml.etree.ElementTree as ET
import time

# VegNonVeg uses a custom headless frontend — their sitemap lives at /sitemaps/ not /
# Discovered via robots.txt: Sitemap: https://www.vegnonveg.com/sitemaps/sitemap.xml
SITEMAP_ROOT  = "https://www.vegnonveg.com/sitemaps/sitemap.xml"
OUTPUT_FILE   = "vnv_links.txt"
HEADERS       = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}

# VNV sitemap uses standard sitemap namespace
NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}


def fetch_xml(url, retries=3):
    """Fetch a URL and return parsed ElementTree root, or None on failure."""
    for attempt in range(1, retries + 1):
        try:
            r = requests.get(url, headers=HEADERS, timeout=15)
            r.raise_for_status()
            return ET.fromstring(r.content)
        except Exception as e:
            print(f"   [attempt {attempt}/{retries}] {url} → {e}")
            time.sleep(2)
    return None


def extract_product_urls(product_sitemap_url):
    """Fetch a products-N.xml and return all product <loc> URLs."""
    root = fetch_xml(product_sitemap_url)
    if root is None:
        return []
    urls = []
    # VNV sitemaps use <urlset><url><loc> — standard sitemap format
    for url_elem in root.findall("sm:url", NS):
        loc = url_elem.find("sm:loc", NS)
        if loc is not None and loc.text and "/products/" in loc.text:
            urls.append(loc.text.strip())
    return urls


def main():
    print("=" * 55)
    print("  VegNonVeg Sitemap Extractor")
    print("=" * 55)
    print(f"\n  Fetching root sitemap: {SITEMAP_ROOT}\n")

    root = fetch_xml(SITEMAP_ROOT)
    if root is None:
        print("❌ Could not fetch root sitemap. Check your connection.")
        return

    # Root sitemap is also a <urlset> — product sub-sitemaps are referenced
    # as <url><loc>...products*.xml</loc> entries (VNV's custom structure)
    product_sitemaps = []
    for url_elem in root.findall("sm:url", NS):
        loc = url_elem.find("sm:loc", NS)
        if loc is not None and loc.text and "products" in loc.text:
            product_sitemaps.append(loc.text.strip())

    if not product_sitemaps:
        print("❌ No product sub-sitemaps found in root sitemap.")
        print("   Sitemap structure may have changed — check manually.")
        return

    # Sort so products.xml comes first, then products-2.xml, products-3.xml ...
    product_sitemaps.sort()
    print(f"  Found {len(product_sitemaps)} product sitemap(s):\n")
    for s in product_sitemaps:
        print(f"    {s}")

    # Collect all product URLs from each sub-sitemap
    all_urls = []
    for i, sm_url in enumerate(product_sitemaps, 1):
        print(f"\n  [{i}/{len(product_sitemaps)}] Fetching {sm_url}...")
        urls = extract_product_urls(sm_url)
        print(f"     → {len(urls)} products")
        all_urls.extend(urls)
        time.sleep(0.5)  # polite pause between requests

    # Deduplicate while preserving order
    seen = set()
    unique_urls = []
    for u in all_urls:
        if u not in seen:
            seen.add(u)
            unique_urls.append(u)

    # Write output file
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(f"# VegNonVeg product URLs — extracted from sitemap\n")
        f.write(f"# {len(unique_urls)} products total\n")
        f.write(f"# To scrape: run sneaker_bot.py and paste '{OUTPUT_FILE}'\n\n")
        for url in unique_urls:
            f.write(url + "\n")

    print(f"\n{'=' * 55}")
    print(f"  ✅ Done — {len(unique_urls)} unique product URLs")
    print(f"  Saved to: {OUTPUT_FILE}")
    print(f"\n  To scrape: run sneaker_bot.py and paste '{OUTPUT_FILE}'")
    print(f"{'=' * 55}\n")


if __name__ == "__main__":
    main()
