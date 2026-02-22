import json
import re
import time
import urllib.request
from pathlib import Path

DATA_DIR = Path("data")
DATA_DIR.mkdir(parents=True, exist_ok=True)

RELICS_URL = "https://raw.githubusercontent.com/WFCD/warframe-relic-data/master/data/Relics.min.json"
WM_ORDERS_URL = "https://api.warframe.market/v1/items/{}/orders"

HEADERS = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (GitHub Actions; mosestyle relic sorter)",
    "Platform": "pc",
    "Language": "en",
}

def get_json(url: str):
    urls = [url, url.rstrip("/") + "/"]
    last_err = None
    for u in urls:
        try:
            req = urllib.request.Request(u, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            last_err = e
    raise last_err

def to_url_name(item_name: str) -> str:
    s = item_name.strip().lower()
    s = s.replace("’", "'").replace("&", "and")
    s = re.sub(r"[^a-z0-9 _'\-]", " ", s)
    s = s.replace("'", " ")
    s = s.replace("-", " ")
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"_+", "_", s)
    return s.strip("_")

def price_from_orders(orders: list):
    # Only require visible + pc.
    sells = []
    buys = []

    for o in orders:
        if not o.get("visible"):
            continue
        if o.get("platform") != "pc":
            continue
        p = o.get("platinum")
        if not isinstance(p, (int, float)):
            continue

        if o.get("order_type") == "sell":
            sells.append(p)
        elif o.get("order_type") == "buy":
            buys.append(p)

    # Prefer lowest sell, fallback to highest buy
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

    drop_names = set()
    for r in relics:
        for d in (r.get("drops") or []):
            nm = d.get("item")
            if nm:
                drop_names.add(nm)

    drop_names = sorted(drop_names)
    print(f"Unique relic drops: {len(drop_names)}")

    prices = {}
    not_found = 0
    other_errors = 0

    for i, name in enumerate(drop_names, start=1):
        url_name = to_url_name(name)
        url = WM_ORDERS_URL.format(url_name)

        try:
            data = get_json(url)
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

        # gentle pacing
        if i % 30 == 0:
            print(f"Processed {i}/{len(drop_names)} • prices so far: {len(prices)}")
            time.sleep(0.4)

    (DATA_DIR / "prices.json").write_text(
        json.dumps(prices, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print(f"Saved prices for: {len(prices)} items")
    print(f"404 not found (slug mismatch): {not_found}")
    print(f"Other errors: {other_errors}")

if __name__ == "__main__":
    main()
