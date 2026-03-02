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

# ── Non-shoe filter ───────────────────────────────────────────────────────────
# VegNonVeg sells apparel, accessories, and collectibles alongside footwear.
# These lists filter out non-shoe URLs so the output contains only footwear.
# Kept in sync with shopify_extractor.py.

# Words that appear as standalone tokens in the slug (split by -)
_NON_SHOE_EXACT = {
    # tops (incl. compound spellings)
    "tee", "tees", "shirt", "shirts", "tshirt", "tshirts",
    "hoodie", "hoody", "hoodies", "sweatshirt", "crewneck", "polo", "cardigan",
    "sweater", "jumper", "fleece", "vest", "bralet", "bralette", "pullover", "jersey",
    "longsleeve",
    # bottoms
    "pant", "pants", "legging", "leggings", "jogger", "joggers",
    "sweatpant", "sweatpants", "sweatshort", "sweatshorts",
    "short", "shorts", "jeans", "trouser", "trousers",
    "trackpant", "trackpants", "chino", "chinos",
    "cargos",                          # cargo pants plural
    # sets / outerwear
    "tracksuit", "tracksuits",
    "jacket", "jackets", "windbreaker", "anorak", "coat", "parka", "raincoat",
    # dresses / women
    "dress", "skirt", "romper", "bodysuit", "swimsuit", "swimwear",
    # headwear
    "cap", "caps", "hat", "hats", "beanie", "beanies", "bonnet",
    "headband", "bucket",
    "5950",                            # New Era fitted cap model
    "strapback",                       # strapback caps
    "trucker",                         # trucker caps and trucker jackets
    # accessories
    "bag", "bags", "backpack", "tote", "pouch", "wallet", "purse",
    "keychain", "keyring", "lanyard", "belt", "belts",
    "glasses", "sunglasses", "goggles",
    "scarf", "scarves", "glove", "gloves",
    # footwear accessories (not shoes themselves)
    "sock", "socks", "insole", "insoles", "laces", "lace",
    # care / cleaning
    "spray", "cleaner", "eraser", "brush", "wipe", "towel",
    "kit", "protector", "deodorizer",
    # collectibles / lifestyle
    "figure", "toy", "doll", "poster", "sticker",
    "mug", "tumbler", "blanket",
    "umbrella", "watch",
    "candle", "diffuser",
    # misc
    "giftcard", "voucher",
    # apparel not yet covered
    "overshirt",                       # ls-overshirt, denim-overshirt, etc.
    "jorts", "skorts",                 # VNV own-brand jean-shorts / skirt-shorts
    "gilet",                           # VNV sleeveless jacket
    "gharara",                         # VNV ethnic pant
    "apron",                           # ASSC apron
    # home / lifestyle
    "rug", "rugs",                     # Virgil x IKEA rug, Pokemon TCG rug
    "chair",                           # Urban Islander chair (LimitedEdt)
    "cushion",                         # cushion cover (CDC)
    "necklace",                        # tennis necklace (CDC)
    "waistbag",                        # waist bag (VNV)
    "keyholder",                       # key holder (VNV)
    # food
    "cookie", "cookies",               # Oreo collab items (Mainstreet)
    # swimming
    "swimshort", "swimshorts",
}

# Substrings that always indicate non-footwear
_NON_SHOE_SUBSTR = (
    # caps / headwear
    "-cap-", "-cap", "bucket-hat", "trucker-cap", "dad-cap", "snapback",
    "-beanie", "five-panel",
    "cargo-type",                      # cargo pants pattern
    # laces / insoles
    "shoelace", "flat-lace", "-lace-", "-laces-", "-insole",
    # bags
    "-bag-", "-bag", "tote-bag", "duffel", "gym-bag", "carry-bag", "-backpack",
    # socks
    "-sock-", "-socks-", "-sock", "-socks", "ankle-sock", "crew-sock",
    # care
    "-spray", "cleaning-towel", "microfiber", "crep-protect", "shoe-care",
    "laundry-bag",
    # apparel substrings (compound words and phrases not caught by token split)
    "tshirt", "t-shirt", "longsleeve", "long-sleeve",
    "tracktop", "track-top", "track-jacket", "tracksuit", "windbreaker",
    "basketball-short", "terry-short", "diamond-short", "denim-short",
    "sweat-short", "running-short", "sweatshort",
    "trouser", "jersey", "jerseyfan", "-jersey-", "football-jersey", "football-scarf",
    "one-piece", "bodysuit",
    # collectibles (bearbrick included intentionally — sold at sneaker stores)
    "blind-box", "kaws",
    # Nike/Adidas internal apparel item codes
    "as-m-", "as-w-", "as-lbj-", "as-kd-",
    "nk-heritage-", "nk-club-", "nk-nsw-",
    # gift / misc
    "gift-card", "e-gift", "voucher",
    # accessories
    "-keychain", "-keyring", "-wallet", "-watch",
    "phone-case", "-tumbler", "-mug",
    "-umbrella", "-poster", "-sticker",
    # caps by model / brand name
    "59fifty",                         # New Era 59Fifty cap model
    "new-era-",                        # New Era brand prefix for caps
    "5-panel-hat",                     # 5-panel hat
    # collectibles
    "funko-pop", "funko",              # Funko Pop figures
    "pokemon-tcg",                     # Pokemon TCG cards/rugs
    # home goods
    "-rug",                            # rug items
    "-apron",                          # aprons
    "-cushion",                        # cushion covers
    "-journal",                        # journals / books
    # accessories
    "waist-bag",                       # hyphenated waist bag variant
    "-necklace",                       # necklaces
    "-keyholder",                      # key holders
    # food
    "oreo",                            # Oreo collab food items
    # apparel substrings
    "overshirt",                       # overshirt as compound word in slug
    "sleeveless",                      # sleeveless tee
    "-swimshort",                      # swim shorts
    # Puma collab apparel (VNV — compound words without hyphens)
    "pumaxbatman", "pumaxgarfield", "pumaxamigraphic",
    "rickandmorty", "harlemtee",
    # branded bags / accessories
    "longchamp",                       # Longchamp handbags
    "sprayground",                     # Sprayground bags
    "-handbag",                        # generic handbag suffix
    # care products
    "crep-cure",                       # Crep Cure shoe cleaner brand
    "hat-care-kit",                    # hat care kit
    # misc
    "pantalon",                        # pants (French collab)
    "-bottle",                         # water bottles
)

# Slug prefixes that are always non-shoe
_APPAREL_PREFIXES = (
    "as-m-", "as-w-", "as-lbj-", "as-kd-",
    "nk-heritage-", "nk-club-", "nk-nsw-",
    "ua-", "ub-",
)

# Slug suffixes that are always non-shoe
_NON_SHOE_SUFFIXES = (
    "-cap", "-hat", "-socks", "-sock", "-bag", "-backpack",
    "-tee", "-hoodie", "-jacket", "-shorts", "-pant", "-pants",
    "-jersey", "-polo", "-vest", "-laces", "-insole",
    "-spray", "-kit", "-brush",
    "-blazer",                         # jacket blazer (≠ Nike Blazer which has -mid/-low after)
    "-tshirt",
    "-trouser", "-trousers",
    "-scarf", "-gloves", "-glove",
    "-tracksuit", "-trackpant", "-trackpants",
    "-longsleeve",
    "-overshirt",                      # catches *-overshirt slugs
    "-rug",
    "-apron",
    "-cushion",
    "-necklace",
)


def _is_non_shoe(slug: str) -> bool:
    """Return True if the product slug is clearly not a shoe."""
    s = slug.lower().split("?")[0]
    if s.startswith(_APPAREL_PREFIXES):
        return True
    if s.endswith(_NON_SHOE_SUFFIXES):
        return True
    words = set(s.replace("_", "-").split("-"))
    if words & _NON_SHOE_EXACT:
        return True
    return any(kw in s for kw in _NON_SHOE_SUBSTR)

# ─────────────────────────────────────────────────────────────────────────────


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

    # Deduplicate while preserving order, filtering non-footwear
    seen = set()
    unique_urls = []
    filtered_out = 0
    for u in all_urls:
        if u in seen:
            continue
        seen.add(u)
        slug = u.split("/products/")[-1].split("?")[0]
        if _is_non_shoe(slug):
            filtered_out += 1
            continue
        unique_urls.append(u)

    # Write output file
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(f"# VegNonVeg footwear URLs — extracted from sitemap\n")
        f.write(f"# {len(unique_urls)} sneaker/footwear products (filtered out {filtered_out} non-shoe items)\n")
        f.write(f"# To scrape: run sneaker_bot.py and paste '{OUTPUT_FILE}'\n\n")
        for url in unique_urls:
            f.write(url + "\n")

    print(f"\n{'=' * 55}")
    print(f"  ✅ Done — {len(unique_urls)} footwear URLs")
    print(f"  Filtered out: {filtered_out} non-shoe items")
    print(f"  Saved to: {OUTPUT_FILE}")
    print(f"\n  To scrape: run sneaker_bot.py and paste '{OUTPUT_FILE}'")
    print(f"{'=' * 55}\n")


if __name__ == "__main__":
    main()
