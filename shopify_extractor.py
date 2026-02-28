"""
shopify_extractor.py — Generic Shopify sitemap extractor
Extracts all footwear product URLs from standard Shopify stores.

Usage:
    python3 shopify_extractor.py              # extracts all 4 stores
    python3 shopify_extractor.py cdc          # extracts only Crepdog Crew
    python3 shopify_extractor.py superkicks   # extracts only Superkicks

Output files (one per store, ready to paste into sneaker_bot.py):
    cdc_links.txt
    mainstreet_links.txt
    superkicks_links.txt
    limitededt_links.txt
"""

import sys
import time
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from typing import Optional

# ── Store definitions ─────────────────────────────────────────────────────────
STORES = {
    "cdc": {
        "name":    "Crepdog Crew",
        "sitemap": "https://crepdogcrew.com/sitemap.xml",
        "output":  "cdc_links.txt",
    },
    "mainstreet": {
        "name":    "Mainstreet",
        "sitemap": "https://marketplace.mainstreet.co.in/sitemap.xml",
        "output":  "mainstreet_links.txt",
    },
    "superkicks": {
        "name":    "Superkicks",
        "sitemap": "https://www.superkicks.in/sitemap.xml",
        "output":  "superkicks_links.txt",
    },
    "limitededt": {
        "name":    "Limited Edt",
        "sitemap": "https://limitededt.in/sitemap.xml",
        "output":  "limitededt_links.txt",
    },
}

# ── Non-shoe filter ───────────────────────────────────────────────────────────
_NON_SHOE_EXACT = {
    # tops (incl. compound spellings)
    "tee", "tees", "shirt", "shirts", "tshirt", "tshirts",
    "hoodie", "hoodies", "sweatshirt", "crewneck", "polo", "cardigan",
    "sweater", "jumper", "fleece", "vest", "bralet", "pullover", "jersey",
    "longsleeve",
    # bottoms
    "pant", "pants", "legging", "leggings", "jogger", "joggers",
    "sweatpant", "sweatpants", "sweatshort", "sweatshorts",
    "short", "shorts", "jeans", "trouser", "trousers",
    "trackpant", "trackpants", "chino", "chinos",
    # sets / outerwear
    "tracksuit", "tracksuits",
    "jacket", "jackets", "windbreaker", "anorak", "coat", "parka", "raincoat",
    # dresses / women
    "dress", "skirt", "romper", "bodysuit", "swimsuit", "swimwear",
    # headwear
    "cap", "caps", "hat", "hats", "beanie", "beanies", "bonnet",
    "headband", "bucket",
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
}

_NON_SHOE_SUBSTR = (
    # caps / headwear
    "-cap-", "-cap", "bucket-hat", "trucker-cap", "dad-cap", "snapback",
    "-beanie", "five-panel",
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
    # collectibles
    "blind-box", "bearbrick", "bear-brick", "kaws",
    # Nike/Adidas internal apparel item codes
    "as-m-", "as-w-", "as-lbj-", "as-kd-",
    "nk-heritage-", "nk-club-", "nk-nsw-",
    # gift / misc
    "gift-card", "e-gift", "voucher",
    # accessories
    "-keychain", "-keyring", "-wallet", "-watch",
    "phone-case", "-tumbler", "-mug",
    "-umbrella", "-poster", "-sticker",
)

_APPAREL_PREFIXES = (
    "as-m-", "as-w-", "as-lbj-", "as-kd-",
    "nk-heritage-", "nk-club-", "nk-nsw-",
    "ua-", "ub-",
)

_NON_SHOE_SUFFIXES = (
    "-cap", "-hat", "-socks", "-sock", "-bag", "-backpack",
    "-tee", "-hoodie", "-jacket", "-shorts", "-pant", "-pants",
    "-jersey", "-polo", "-vest", "-laces", "-insole",
    "-spray", "-kit", "-brush",
    "-blazer",          # jacket blazer (≠ Nike Blazer which has -mid/-low after)
    "-tshirt",          # compound tshirt suffix
    "-trouser", "-trousers",
    "-scarf", "-gloves", "-glove",
    "-tracksuit", "-trackpant", "-trackpants",
    "-longsleeve",
)


def _is_non_shoe(slug: str) -> bool:
    """Return True if the product slug is NOT footwear."""
    s = slug.lower().split("?")[0]
    if s.startswith(_APPAREL_PREFIXES):
        return True
    if s.endswith(_NON_SHOE_SUFFIXES):
        return True
    words = set(s.replace("_", "-").split("-"))
    if words & _NON_SHOE_EXACT:
        return True
    return any(kw in s for kw in _NON_SHOE_SUBSTR)


# ── HTTP helpers ──────────────────────────────────────────────────────────────
_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; SitemapBot/1.0)"}
NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}


def _fetch(url: str, retries: int = 3) -> bytes:
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers=_HEADERS)
            with urllib.request.urlopen(req, timeout=15) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            print(f"     HTTP {e.code} on {url}")
            if attempt < retries:
                time.sleep(2)
            else:
                return b""
        except Exception as e:
            print(f"     Error fetching {url}: {e}")
            if attempt < retries:
                time.sleep(2)
            else:
                return b""
    return b""


def _parse_xml(data: bytes) -> Optional[ET.Element]:
    try:
        return ET.fromstring(data)
    except ET.ParseError as e:
        print(f"     XML parse error: {e}")
        return None


# ── Sitemap parsing ───────────────────────────────────────────────────────────
def get_product_sitemaps(root_sitemap_url: str) -> list[str]:
    """Parse a Shopify <sitemapindex> and return all sitemap_products_*.xml URLs."""
    data = _fetch(root_sitemap_url)
    if not data:
        return []
    root = _parse_xml(data)
    if root is None:
        return []

    # Handle both namespaced and non-namespaced XML
    locs = [e.text.strip() for e in root.iter() if e.tag.endswith("loc") and e.text]
    return [loc for loc in locs if "sitemap_products_" in loc]


_IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".avif")

def extract_product_urls(product_sitemap_url: str) -> list[str]:
    """Fetch a Shopify product sub-sitemap and return all /products/ page URLs.

    Shopify sitemaps embed <image:loc> CDN image URLs inside <url> blocks.
    Those also contain '/products/' in the path, so we must filter them out
    by excluding cdn.shopify.com URLs and any URL ending with an image extension.
    """
    data = _fetch(product_sitemap_url)
    if not data:
        return []
    root = _parse_xml(data)
    if root is None:
        return []
    locs = [e.text.strip() for e in root.iter() if e.tag.endswith("loc") and e.text]
    return [
        loc for loc in locs
        if "/products/" in loc
        and "cdn.shopify.com" not in loc
        and not loc.lower().endswith(_IMAGE_EXTS)
    ]


# ── Per-store extraction ──────────────────────────────────────────────────────
def extract_store(store_key: str) -> int:
    """Extract, filter and save footwear URLs for one store. Returns count."""
    cfg = STORES[store_key]
    name = cfg["name"]
    out  = cfg["output"]

    print(f"\n{'=' * 58}")
    print(f"  {name}")
    print(f"{'=' * 58}")
    print(f"  Fetching root sitemap: {cfg['sitemap']}")

    product_sitemaps = get_product_sitemaps(cfg["sitemap"])
    if not product_sitemaps:
        print("  ❌ No product sitemaps found.")
        return 0

    print(f"\n  Found {len(product_sitemaps)} product sitemap(s)")

    all_urls: list[str] = []
    for i, sm_url in enumerate(product_sitemaps, 1):
        print(f"\n  [{i}/{len(product_sitemaps)}] {sm_url.split('/')[-1].split('?')[0]} ...", end=" ", flush=True)
        urls = extract_product_urls(sm_url)
        print(f"{len(urls)} products")
        all_urls.extend(urls)
        time.sleep(0.5)

    # Deduplicate + filter
    seen: set[str] = set()
    footwear: list[str] = []
    filtered_out = 0
    for u in all_urls:
        if u in seen:
            continue
        seen.add(u)
        slug = u.split("/products/")[-1]
        if _is_non_shoe(slug):
            filtered_out += 1
        else:
            footwear.append(u)

    # Write output
    with open(out, "w", encoding="utf-8") as f:
        f.write(f"# {name} footwear URLs — extracted from Shopify sitemap\n")
        f.write(f"# {len(footwear)} sneaker/footwear products (filtered out {filtered_out} non-shoe items)\n")
        f.write(f"# To scrape: run sneaker_bot.py and paste '{out}'\n\n")
        for url in footwear:
            f.write(url + "\n")

    print(f"\n  ✅ {len(footwear)} footwear URLs  ({filtered_out} non-shoe filtered)")
    print(f"  Saved to: {out}")
    return len(footwear)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    args = [a.lower() for a in sys.argv[1:]]

    if args:
        keys = [k for k in args if k in STORES]
        if not keys:
            print(f"Unknown store(s): {args}")
            print(f"Available: {list(STORES.keys())}")
            sys.exit(1)
    else:
        keys = list(STORES.keys())

    print("\n  Shopify Sitemap Extractor")
    totals = {}
    for key in keys:
        totals[key] = extract_store(key)

    print(f"\n{'=' * 58}")
    print("  Summary:")
    for key, count in totals.items():
        print(f"    {STORES[key]['name']:20s}  →  {count:,} footwear URLs  →  {STORES[key]['output']}")
    print(f"{'=' * 58}\n")


if __name__ == "__main__":
    main()
