import json
import re
import time
import urllib.request
import urllib.error
from pathlib import Path

DATA_DIR = Path("data")
DATA_DIR.mkdir(parents=True, exist_ok=True)

RELICS_URL = "https://raw.githubusercontent.com/WFCD/warframe-relic-data/master/data/Relics.min.json"

WM_BASE = "https://api.warframe.market/v1"
WM_ITEMS_URL = f"{WM_BASE}/items"
WM_ORDERS_URL = f"{WM_BASE}/items/{{}}/orders"

HEADERS = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (GitHub Actions; mosestyle relic sorter)",
    # IMPORTANT: Platform is set here, not inside each order object:
    "Platform": "pc",
    "Language": "en",
}

def get_json(url: str, timeout=60, retries=3, backoff=1.2):
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            # retry common transient errors
            if e.code in (429, 502, 503, 504):
                last_err = e
                time.sleep(backoff * attempt)
                continue
            raise
        except Exception as e:
            last_err = e
            time.sleep(backoff * attempt)
    raise last_err

def to_guess_url_name(item_name: str) -> str:
    s = item_name.strip().lower()
    s = s.replace("’", "'").replace("&", "and")
    s = re.sub(r"[^a-z0-9 _'\-]", " ", s)
    s = s.replace("'", " ")
    s = s.replace("-", " ")
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"_+", "_", s)
    return s.strip("_")

def price_from_orders(orders: list):
    # Visible orders only. Prefer lowest sell; fallback to highest buy.
    # NOTE: Do NOT filter on o["platform"] here — platform is set by request header.
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

    # Collect unique drop item names from relics
    drop_names = set()
    for r in relics:
        for d in (r.get("drops") or []):
            nm = d.get("item")
            if nm:
                drop_names.add(nm)

    drop_names = sorted(drop_names)
    print(f"Unique relic drops: {len(drop_names)}")

    # Build official name -> url_name mapping from warframe.market
    print("Downloading Warframe.market items list…")
    items_payload = get_json(WM_ITEMS_URL)
    items = items_payload.get("payload", {}).get("items", []) or []
    print(f"Market items downloaded: {len(items)}")

    name_to_url = {}
    for it in items:
        item_name = it.get("item_name") or it.get("en", {}).get("item_name")
        url_name = it.get("url_name")
        if item_name and url_name:
            name_to_url[item_name] = url_name

    prices = {}
    missing_in_items = 0
    not_found_orders = 0
    other_errors = 0

    for i, name in enumerate(drop_names, start=1):
        url_name = name_to_url.get(name)
        if not url_name:
            missing_in_items += 1
            url_name = to_guess_url_name(name)

        url = WM_ORDERS_URL.format(url_name)

        try:
            data = get_json(url, retries=4, backoff=1.6)
            orders = data.get("payload", {}).get("orders", []) or []
            p = price_from_orders(orders)
            if p is not None:
                prices[name] = p

        except urllib.error.HTTPError as e:
            if e.code == 404:
                not_found_orders += 1
            else:
                other_errors += 1
        except Exception:
            other_errors += 1

        if i % 25 == 0:
            print(f"Processed {i}/{len(drop_names)} • prices so far: {len(prices)}")
            time.sleep(0.7)

    (DATA_DIR / "prices.json").write_text(
        json.dumps(prices, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print("DONE")
    print(f"Saved prices for: {len(prices)} items")
    print(f"Missing from /items list (used fallback slug): {missing_in_items}")
    print(f"404 on /orders: {not_found_orders}")
    print(f"Other errors: {other_errors}")

if __name__ == "__main__":
    main()
