"""
footlocker_extractor.py — Foot Locker India product link extractor

⚠️  BLOCKED: footlocker.co.in uses Cloudflare bot protection.
    Direct HTTP, standard Selenium, and undetected-chromedriver all return
    "Access Denied" in headless mode.

    To use this extractor you need one of:
    1. Non-headless Selenium (remove --headless flag and interact manually past CF challenge)
    2. A browser extension that exports links from the listing pages
    3. A residential proxy + stealth browser setup

    The site IS fully integrated on the Sneakopedia frontend as a retailer
    link (getLinks, domainToRetailer, brandMap) — this file is just for
    bulk link harvesting for sneaker_bot.py batch mode.

Usage (if CF protection is ever bypassed):
    python3 footlocker_extractor.py
"""

import re
import time

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# ── Config ───────────────────────────────────────────────────────────────────
BASE_URL   = "https://www.footlocker.co.in"
OUTPUT     = "footlocker_links.txt"

# Category pages to scrape (add more if needed)
CATEGORIES = [
    {
        "name": "Men Sneakers",
        "url":  f"{BASE_URL}/men/footwear/sneakers/c/6864",
    },
    {
        "name": "Women Sneakers",
        "url":  f"{BASE_URL}/women/footwear/sneakers/c/6886",
    },
    {
        "name": "Kids Sneakers",
        "url":  f"{BASE_URL}/kids/footwear/sneakers/c/6906",
    },
]

PAGE_LOAD_WAIT = 5   # seconds after page load before reading links
MAX_PAGES      = 50  # safety cap per category

# ── Non-shoe filter (same as other extractors) ────────────────────────────────
_NON_SHOE_EXACT = {
    "tee", "tees", "shirt", "shirts", "hoodie", "hoodies", "sweatshirt",
    "crewneck", "polo", "cardigan", "sweater", "jumper", "fleece", "vest",
    "pullover", "jersey", "pant", "pants", "legging", "leggings",
    "jogger", "joggers", "sweatpant", "sweatpants", "short", "shorts",
    "jacket", "jackets", "windbreaker", "anorak", "coat", "bomber",
    "dress", "skirt", "romper", "bodysuit", "swimsuit", "bra", "top", "tops",
    "cap", "caps", "hat", "hats", "beanie", "beanies", "headband",
    "bag", "bags", "backpack", "tote", "wallet", "keychain", "belt",
    "glasses", "sunglasses", "sock", "socks", "insole", "insoles", "laces",
    "spray", "cleaner", "brush", "kit", "protector",
    "giftcard", "voucher",
}

_NON_SHOE_SUBSTR = (
    "-cap", "bucket-hat", "trucker-cap", "-beanie",
    "shoelace", "-lace-", "-laces-", "-insole",
    "-bag", "tote-bag", "-backpack",
    "-sock-", "-socks-", "-sock", "-socks",
    "-spray", "shoe-care",
    "track-top", "track-jacket",
    "gift-card", "e-gift",
    "-keychain", "-wallet",
)

_NON_SHOE_SUFFIXES = (
    "-cap", "-hat", "-socks", "-sock", "-bag", "-backpack",
    "-tee", "-hoodie", "-jacket", "-shorts", "-pant", "-pants",
    "-jersey", "-polo", "-vest", "-laces", "-insole", "-spray", "-kit",
)


def _is_non_shoe(slug: str) -> bool:
    s = slug.lower().split("?")[0]
    if s.endswith(_NON_SHOE_SUFFIXES):
        return True
    words = set(s.replace("_", "-").split("-"))
    if words & _NON_SHOE_EXACT:
        return True
    return any(kw in s for kw in _NON_SHOE_SUBSTR)


# ── Browser setup ─────────────────────────────────────────────────────────────
def make_driver() -> webdriver.Chrome:
    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=1920,1080")
    opts.add_argument(
        "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
    # Reduce bot fingerprint
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    driver = webdriver.Chrome(options=opts)
    driver.execute_cdp_cmd(
        "Page.addScriptToEvaluateOnNewDocument",
        {"source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"}
    )
    return driver


# ── Link extraction from a loaded page ───────────────────────────────────────
def get_product_links(driver: webdriver.Chrome) -> list[str]:
    """Extract all /products/ hrefs from the current page."""
    anchors = driver.find_elements(By.TAG_NAME, "a")
    links = []
    for a in anchors:
        try:
            href = a.get_attribute("href") or ""
            if "/products/" in href and href.startswith(BASE_URL):
                links.append(href.split("?")[0])  # strip query params
        except Exception:
            pass
    return links


def has_next_page(driver: webdriver.Chrome, current_page: int) -> bool:
    """Check if there's a next page button that is not disabled."""
    try:
        # Foot Locker uses ?p=N pagination
        # Look for a link to the next page number
        page_links = driver.find_elements(By.CSS_SELECTOR, "a[href*='?p=']")
        for pl in page_links:
            href = pl.get_attribute("href") or ""
            m = re.search(r'\?p=(\d+)', href)
            if m and int(m.group(1)) == current_page + 1:
                return True
        # Also check for a "next" button
        next_btns = driver.find_elements(By.CSS_SELECTOR,
            "a.next, button.next, [aria-label='Next'], [class*='next-page']:not([disabled])")
        for btn in next_btns:
            if btn.is_displayed() and btn.is_enabled():
                return True
    except Exception:
        pass
    return False


# ── Per-category scrape ───────────────────────────────────────────────────────
def scrape_category(driver: webdriver.Chrome, name: str, base_url: str) -> list[str]:
    print(f"\n  Category: {name}")
    all_links: list[str] = []
    page = 1

    while page <= MAX_PAGES:
        url = f"{base_url}?p={page}&f=sort%3Dlow-to-high"
        print(f"    Page {page} ...", end=" ", flush=True)
        driver.get(url)
        time.sleep(PAGE_LOAD_WAIT)

        links = get_product_links(driver)
        if not links:
            print("no products found — stopping")
            break

        print(f"{len(links)} products")
        all_links.extend(links)

        if not has_next_page(driver, page):
            print(f"    → No page {page + 1} found — done")
            break

        page += 1
        time.sleep(1)

    return all_links


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print(f"\n{'=' * 58}")
    print(f"  Foot Locker India Extractor")
    print(f"  (Selenium required — site blocks direct HTTP)")
    print(f"{'=' * 58}")

    driver = make_driver()
    all_links: list[str] = []

    try:
        for cat in CATEGORIES:
            links = scrape_category(driver, cat["name"], cat["url"])
            all_links.extend(links)
    finally:
        driver.quit()

    # Deduplicate + filter
    seen: set[str] = set()
    footwear: list[str] = []
    filtered_out = 0
    for u in all_links:
        if u in seen:
            continue
        seen.add(u)
        slug = u.split("/products/")[-1]
        if _is_non_shoe(slug):
            filtered_out += 1
        else:
            footwear.append(u)

    with open(OUTPUT, "w", encoding="utf-8") as f:
        f.write("# Foot Locker India footwear URLs — extracted via Selenium\n")
        f.write(f"# {len(footwear)} sneaker/footwear products (filtered out {filtered_out} non-shoe items)\n")
        f.write(f"# To scrape: run sneaker_bot.py and paste '{OUTPUT}'\n\n")
        for url in footwear:
            f.write(url + "\n")

    print(f"\n{'=' * 58}")
    print(f"  ✅ Done — {len(footwear)} footwear URLs")
    print(f"  Filtered out: {filtered_out} non-shoe items")
    print(f"  Saved to: {OUTPUT}")
    print(f"{'=' * 58}\n")


if __name__ == "__main__":
    main()
