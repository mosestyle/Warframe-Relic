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
    """Fetch JSON, trying both with and without trailing slash."""
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
    """
    Best-effort conversion from item display name to warframe.market url_name.
    Example: "Nova Prime Neuroptics Blueprint" -> "nova_prime_neuroptics_blueprint"
    """
    s = item_name.strip().lower()

    # Normalize common punctuation / special chars
    s = s.replace("’", "'")
    s = s.replace("&", "and")

    # Remove anything that's not a-z, 0-9, space, underscore, or apostrophe
    # Then remove apostrophes (wfm url_name typically omits them)
    s = re.sub(r"[^a-z0-9 _'\-]", " ", s)
    s = s.replace("'", " ")

    # Hyphens to spaces
    s = s.replace("-", " ")

    # Spaces to underscores, collapse repeats
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"_+", "_", s)
    s = s.strip("_")
    return s

def lowest_sell_plat(orders: list) -> int | None:
    """Return lowest sell price among visible PC orders from online/ingame users."""
    sells = []
    for o in orders:
        if not o.get("visible"):
            continue
        if o.get("platform") != "pc":
            continue
        user = o.get("user") or {}
        if user.get("status") not in ("online", "ingame"):
            continue
        if o.get("order_type") != "sell":
            continue
        p = o.get("platinum")
        if isinstance(p, (int, float)):
            sells.append(p)

    if not sells:
        return None
    return int(round(min(sells)))

def main():
    print("Downloading relics…")
    relics = get_json(RELICS_URL)
    (DATA_DIR / "Relics.min.json").write_text(json.dumps(relics), encoding="utf-8")
    print(f"Relics downloaded: {len(relics)}")

    # Collect unique drop names from relics
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
    errors = 0

    # Gentle pacing
    for i, name in enumerate(drop_names, start=1):
        url_name = to_url_name(name)
        url = WM_ORDERS_URL.format(url_name)

        try:
            data = get_json(url)
            orders = data.get("payload", {}).get("orders", []) or []
            p = lowest_sell_plat(orders)

            if p is not None:
                prices[name] = p
            else:
                # item exists but no filtered sells
                pass

        except urllib.error.HTTPError as e:
            # Many misses will be 404 if url_name doesn't exist exactly
            if e.code == 404:
                not_found += 1
            else:
                errors += 1
        except Exception:
            errors += 1

        if i % 40 == 0:
            print(f"Processed {i}/{len(drop_names)}")
            time.sleep(0.6)

    (DATA_DIR / "prices.json").write_text(
        json.dumps(prices, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print(f"Saved prices for: {len(prices)} items")
    print(f"404 not found (slug mismatch): {not_found}")
    print(f"Other errors: {errors}")

if __name__ == "__main__":
    main()
