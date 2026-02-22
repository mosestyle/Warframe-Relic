import json
import time
import urllib.request
from pathlib import Path

DATA_DIR = Path("data")
DATA_DIR.mkdir(parents=True, exist_ok=True)

RELICS_URL = "https://raw.githubusercontent.com/WFCD/warframe-relic-data/master/data/Relics.min.json"
WM_ITEMS_URL = "https://api.warframe.market/v1/items"
WM_ORDERS_URL = "https://api.warframe.market/v1/items/{}/orders"

# These headers help warframe.market respond correctly (some setups return 404/403 without them)
HEADERS = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (GitHub Actions; mosestyle relic sorter)",
    "Platform": "pc",
    "Language": "en",
}

def get_json(url: str):
    """
    Fetch JSON from a URL, trying both with and without a trailing slash.
    This avoids failing hard if a CDN/edge returns 404 on one form.
    """
    urls = [url, url.rstrip("/") + "/"]
    last_err = None

    for u in urls:
        try:
            req = urllib.request.Request(u, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read().decode("utf-8")
                return json.loads(raw)
        except Exception as e:
            last_err = e

    raise last_err

def extract_items_list(items_json: dict):
    """
    warframe.market can return different shapes over time.
    We accept any of these:
      payload.items (list)
      payload.items.en (list)
      payload.items['en'] (list)
    """
    payload = items_json.get("payload", {})
    items = payload.get("items")

    if isinstance(items, list):
        return items

    if isinstance(items, dict):
        for k in ("en", "EN"):
            v = items.get(k)
            if isinstance(v, list):
                return v

    return []

def main():
    print("Downloading relics…")
    relics = get_json(RELICS_URL)
    (DATA_DIR / "Relics.min.json").write_text(json.dumps(relics), encoding="utf-8")
    print(f"Relics downloaded: {len(relics)}")

    print("Downloading warframe.market items list (name->url_name map)…")
    items_list = get_json(WM_ITEMS_URL)
    items = extract_items_list(items_list)
    print(f"Items received: {len(items)}")

    name_to_url = {}
    for it in items:
        name = it.get("item_name")
        url = it.get("url_name")
        if name and url:
            name_to_url[name] = url

    print(f"Market items mapped: {len(name_to_url)}")

    # Collect unique drops from relics
    drop_names = set()
    for r in relics:
        drops = r.get("drops") or []
        for d in drops:
            nm = d.get("item")
            if nm:
                drop_names.add(nm)

    drop_names = sorted(drop_names)
    print(f"Unique relic drops: {len(drop_names)}")

    prices = {}
    misses = 0

    # Be polite to the API to reduce the chance of being rate-limited
    for i, name in enumerate(drop_names, start=1):
        url_name = name_to_url.get(name)
        if not url_name:
            misses += 1
            continue

        try:
            orders_json = get_json(WM_ORDERS_URL.format(url_name))
            orders = orders_json.get("payload", {}).get("orders", []) or []

            # Filter: visible + PC + online/ingame
            filt = []
            for o in orders:
                if not o.get("visible"):
                    continue
                if o.get("platform") != "pc":
                    continue
                user = o.get("user") or {}
                if user.get("status") not in ("ingame", "online"):
                    continue
                filt.append(o)

            sells = [
                o.get("platinum") for o in filt
                if o.get("order_type") == "sell" and isinstance(o.get("platinum"), (int, float))
            ]

            # Pricing rule: lowest sell
            if sells:
                prices[name] = int(round(min(sells)))

        except Exception:
            # Skip on any temporary network/API problems
            pass

        if i % 40 == 0:
            print(f"Processed {i}/{len(drop_names)}")
            time.sleep(0.6)

    (DATA_DIR / "prices.json").write_text(
        json.dumps(prices, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print(f"Saved prices for: {len(prices)} items")
    print(f"Name->url misses: {misses}")

if __name__ == "__main__":
    main()