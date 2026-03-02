"""
fix_nb_models.py — Post-scrape patch for New Balance 4-digit model numbers.

Problem: The old scraper regex `[A-Za-z]{0,3}\d{4,6}` (zero letters allowed)
stripped model numbers like 1000, 9060, 2002 from New Balance shoe names,
producing documents like:
  shoeName: "New Balance White"   (was "New Balance 1000 White")
  canonicalName: "white"          (wrong — collides across models)

Fix: For every NB doc missing a 4-digit model number in its name, extract the
model from the URL slug stored in retailerLinks, rebuild the shoeName, and
update the doc. Because the canonical changes, we must create a new doc and
delete the old one (MongoDB _ids are immutable).

Run after all scraping is complete:
  MONGODB_URI="..." python3 fix_nb_models.py
"""

import os, re, hashlib, unicodedata
from pymongo import MongoClient

# ── Mirrors normalize_canonical() in sneaker_bot.py (FIXED version) ──────────
_BRAND_PREFIXES = [
    r'^nike\s+', r'^adidas\s+', r'^new balance\s+', r'^jordan brand\s+',
    r'^converse\s+', r'^reebok\s+', r'^asics\s+', r'^puma\s+',
    r'^vans\s+', r'^on running\s+', r'^hoka one one\s+', r'^hoka\s+',
    r'^salomon\s+', r'^ugg\s+',
]
_NOISE_WORDS = {
    'the', 'and', 'with', 'for', 'by', 'in', 'a', 'an',
    'retro', 'og',
    'gs', 'ps', 'td', 'bp', 'preschool', 'gradeschool', 'toddler',
}

def normalize_canonical(name: str) -> str:
    s = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode('ascii')
    s = s.lower()
    for pat in _BRAND_PREFIXES:
        s = re.sub(pat, '', s, count=1)
    # FIXED: require ≥1 letter prefix so 1000/9060/2002 are NOT stripped
    s = re.sub(r'\b[a-z]{1,3}\d{4,6}(?:-\d{3})?\b', '', s)
    s = re.sub(r'\b\d{4,6}-\d{3}\b', '', s)
    # Digits-first codes like 162053c (5+ digits so NB 2002R/1906D are preserved)
    s = re.sub(r'\b\d{5,6}[a-z]{1,2}\b', '', s)
    s = re.sub(r'\([^)]*\)', '', s)
    s = re.sub(r'\[[^\]]*\]', '', s)
    s = s.replace("'", '').replace('"', '')
    s = re.sub(r'[^a-z0-9\s]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    tokens = [t for t in s.split() if t and t not in _NOISE_WORDS]
    return ' '.join(tokens)

def make_canonical_id(canonical: str, brand: str) -> str:
    key = f"{brand.lower().strip()}||{canonical}"
    return 'c_' + hashlib.sha256(key.encode('utf-8')).hexdigest()[:16]

def extract_nb_model(url: str) -> str | None:
    """Pull the NB model number out of a product URL slug.
    'new-balance-1000-black-white' → '1000'
    'nb-9060-white-gray'          → '9060'
    """
    if '/products/' not in url:
        return None
    slug = url.split('/products/')[-1].split('?')[0].lower()
    # NB slugs: new-balance-NNNN-... or just NNNN-...
    m = re.search(r'(?:new-balance-|nb-)(\d{3,5})(?:-|$)', slug)
    if m:
        return m.group(1)
    # Fallback: bare model at start of slug
    m = re.search(r'^(\d{3,5})-', slug)
    if m:
        return m.group(1)
    return None

def has_model_number(name: str) -> bool:
    """True if the shoe name already contains a 3-5 digit model number."""
    return bool(re.search(r'\b\d{3,5}\b', name))

# ── Main ─────────────────────────────────────────────────────────────────────
MONGODB_URI = os.environ.get("MONGODB_URI", "")
if not MONGODB_URI:
    print("❌  Set MONGODB_URI env var first.")
    raise SystemExit(1)

client = MongoClient(MONGODB_URI)
col = client["sneakopedia"]["sneakers"]

print("🔍  Scanning New Balance documents...")
nb_docs = list(col.find({"brand": "New Balance"}))
print(f"    Found {len(nb_docs)} New Balance documents\n")

fixes = []
for doc in nb_docs:
    shoe_name = doc.get("shoeName", "")

    # Skip docs that already have a model number
    if has_model_number(shoe_name):
        continue

    # Try to get model from the first available retailer URL
    model = None
    for link in doc.get("retailerLinks", []):
        model = extract_nb_model(link.get("url", ""))
        if model:
            break

    if not model:
        print(f"  ⚠️  No model found for: {shoe_name!r}  (id={doc['_id']})")
        continue

    # Insert model number after "New Balance" in the display name
    new_name = re.sub(r'^(New Balance)\s+', f'New Balance {model} ', shoe_name)
    if not new_name.startswith("New Balance"):
        new_name = f"New Balance {model} {shoe_name}".strip()

    new_canonical = normalize_canonical(new_name)
    new_id = make_canonical_id(new_canonical, "New Balance")

    fixes.append({
        "old_id":       doc["_id"],
        "new_id":       new_id,
        "old_name":     shoe_name,
        "new_name":     new_name,
        "new_canonical": new_canonical,
        "doc":          doc,
    })

if not fixes:
    print("✅  No broken NB docs found — nothing to fix.")
    raise SystemExit(0)

print(f"Found {len(fixes)} docs that need patching:\n")
for f in fixes:
    print(f"  [{f['old_id']}]  {f['old_name']!r}")
    print(f"    →  {f['new_name']!r}  (canonical: {f['new_canonical']!r})\n")

confirm = input("Apply all fixes? (yes/no): ").strip().lower()
if confirm != "yes":
    print("Aborted — no changes made.")
    raise SystemExit(0)

ok = fail = 0
for f in fixes:
    try:
        new_doc = {k: v for k, v in f["doc"].items() if k != "_id"}
        new_doc["_id"]           = f["new_id"]
        new_doc["shoeName"]      = f["new_name"]
        new_doc["canonicalName"] = f["new_canonical"]

        # Check if target _id already exists (merge case)
        existing = col.find_one({"_id": f["new_id"]})
        if existing:
            # Merge retailerLinks from old doc into existing
            for link in new_doc.get("retailerLinks", []):
                retailer = link.get("retailer")
                col.update_one(
                    {"_id": f["new_id"]},
                    {"$pull": {"retailerLinks": {"retailer": retailer}}}
                )
                col.update_one(
                    {"_id": f["new_id"]},
                    {"$push": {"retailerLinks": link}}
                )
            col.delete_one({"_id": f["old_id"]})
            print(f"  🔀 Merged into existing: {f['new_name']!r}")
        else:
            col.insert_one(new_doc)
            col.delete_one({"_id": f["old_id"]})
            print(f"  ✅ Fixed: {f['old_name']!r} → {f['new_name']!r}")
        ok += 1
    except Exception as e:
        print(f"  ❌ Error on {f['old_id']}: {e}")
        fail += 1

print(f"\nDone — {ok} fixed, {fail} errors.")
print("\n💡  Next steps:")
print("   1. Re-run the extractors to get bearbrick URLs:")
print("      python3 vnv_extractor.py")
print("      python3 shopify_extractor.py")
print("   2. Grep bearbrick URLs and scrape them:")
print("      grep bearbrick vnv_links.txt > bearbrick_links.txt")
print("      grep bearbrick cdc_links.txt >> bearbrick_links.txt")
print("      ... then run sneaker_bot.py on bearbrick_links.txt")
