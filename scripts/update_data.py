import json
import time
import urllib.request
from pathlib import Path

DATA_DIR = Path("data")
DATA_DIR.mkdir(parents=True, exist_ok=True)

RELICS_URL = "https://raw.githubusercontent.com/WFCD/warframe-relic-data/master/data/Relics.min.json"
WM_ITEMS_URL = "https://api.warframe.market/v1/items"
WM_ORDERS_URL = "https://api.warframe.market/v1/items/{}/orders"

HEADERS = {
    "Accept": "application/json",
    "User-Agent": "mosestyle-warframe-relic-sorter (github actions)"
}

def get_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))

def main():
    print("Downloading relics…")
    relics = get_json(RELICS_URL)
    (DATA_DIR / "Relics.min.json").write_text(json.dumps(relics), encoding="utf-8")

    print("Downloading warframe.market items list (name->url_name map)…")
    items_list = get_json(WM_ITEMS_URL)
    # payload.items.en is commonly used
    en_items = (items_list.get("payload", {}).get("items", {}).get("en", []) or [])

    name_to_url = {}
    for it in en_items:
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

    # Rate limit: be gentle
    for i, name in enumerate(drop_names, start=1):
        url_name = name_to_url.get(name)
        if not url_name:
            misses += 1
            continue

        try:
            orders_json = get_json(WM_ORDERS_URL.format(url_name))
            orders = orders_json.get("payload", {}).get("orders", []) or []

            # filter: visible + platform pc + ingame users (avoid offline spam)
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

            sells = [o["platinum"] for o in filt if o.get("order_type") == "sell" and isinstance(o.get("platinum"), (int, float))]
            buys  = [o["platinum"] for o in filt if o.get("order_type") == "buy"  and isinstance(o.get("platinum"), (int, float))]

            # Choose ONE pricing rule. This one is "lowest sell" (common for quick compare).
            # If you prefer "highest buy", swap to: price = max(buys) if buys else None
            price = min(sells) if sells else None

            if price is not None:
                prices[name] = int(round(price))

        except Exception:
            # skip on any network/API error
            pass

        if i % 50 == 0:
            print(f"Processed {i}/{len(drop_names)}")
            time.sleep(0.6)

    (DATA_DIR / "prices.json").write_text(json.dumps(prices, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved prices for: {len(prices)} items")
    print(f"Name->url misses: {misses}")

if __name__ == "__main__":
    main()