import json
import time
import urllib.request
import urllib.error
from pathlib import Path

DATA_DIR = Path("data")
DATA_DIR.mkdir(parents=True, exist_ok=True)

RELICS_URL = "https://raw.githubusercontent.com/WFCD/warframe-relic-data/master/data/Relics.min.json"

# WFCD items list (name -> url_name). This avoids /v1/items which is 404 for you.
WFCD_ITEMS_URL = "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/All.json"

WM_BASE = "https://api.warframe.market/v1"
WM_ORDERS_URL = f"{WM_BASE}/items/{{}}/orders"

HEADERS = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (GitHub Actions; mosestyle relic sorter)",
    "Platform": "pc",
    "Language": "en",
}

def get_json(url: str, timeout=60, retries=3, backoff=1.4):
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            # retry transient errors
            if e.code in (429, 500, 502, 503, 504):
                last_err = e
                time.sleep(backoff * attempt)
                continue
            raise
        except Exception as e:
            last_err = e
            time.sleep(backoff * attempt)
    raise last_err

def price_from_orders(orders: list):
    # Do NOT filter on order["platform"] — platform is controlled by request header.
    sells = []
    buys = []

    for o in orders:
        if not o.get("visible", False):
            continue
        p = o.get("platinum")
        if not isinstance(p, (int, float)):
            continue

        if o.get("order_type") == "sell":
            sells.append(p)
        elif o.get("order_type") == "buy":
            buys.append(p)

    # Lowest sell = typical market price. If none, fallback to highest buy.
    if sells:
        return int(round(min(sells)))
    if buys:
        return int(round(max(buys)))
    return None

def main():
    print("Downloading relics…")
    relics = get_json(RELICS_URL)
    (DATA_DIR / "Relics.min.json").write_text(json.dumps(relics), encoding="utf-8")
    print(f"Relics downloaded: {len(relics)}")

    # Your relic json may have "drops" or "rewards". Support both.
    drop_names = set()
    for r in relics:
        rewards = r.get("drops") or r.get("rewards") or []
        for d in rewards:
            nm = d.get("item") or d.get("name")
            if nm:
                drop_names.add(nm)

    drop_names = sorted(drop_names)
    print(f"Unique relic drops: {len(drop_names)}")

    print("Downloading WFCD items list…")
    items = get_json(WFCD_ITEMS_URL)
    print(f"WFCD items: {len(items)}")

    # Build map item_name -> url_name using common fields in WFCD data
    name_to_url = {}
    for it in items:
        # candidate names
        names = []
        if isinstance(it.get("name"), str):
            names.append(it["name"])
        if isinstance(it.get("uniqueName"), str):
            # uniqueName is not the display name; ignore for mapping
            pass

        # candidate url_name fields
        url_name = it.get("url_name") or it.get("urlName") or it.get("warframeMarketUrlName")

        if url_name and names:
            for nm in names:
                name_to_url[nm] = url_name

    print(f"Mapped names: {len(name_to_url)}")

    prices = {}
    missing_url = 0
    not_found = 0
    other_errors = 0

    for i, name in enumerate(drop_names, start=1):
        url_name = name_to_url.get(name)
        if not url_name:
            missing_url += 1
            continue  # cannot price without url_name

        url = WM_ORDERS_URL.format(url_name)

        try:
            data = get_json(url, retries=4, backoff=1.7)
            orders = data.get("payload", {}).get("orders", []) or []
            p = price_from_orders(orders)
            if p is not None:
                prices[name] = p

        except urllib.error.HTTPError as e:
            if e.code == 404:
                not_found += 1
            else:
                other_errors += 1
        except Exception:
            other_errors += 1

        if i % 25 == 0:
            print(f"Processed {i}/{len(drop_names)} • prices: {len(prices)}")
            time.sleep(0.7)

    (DATA_DIR / "prices.json").write_text(
        json.dumps(prices, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print("DONE")
    print(f"Saved prices for: {len(prices)} items")
    print(f"Missing url_name for: {missing_url}")
    print(f"404 on orders: {not_found}")
    print(f"Other errors: {other_errors}")

if __name__ == "__main__":
    main()
