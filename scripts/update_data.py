import json, time, urllib.request
from pathlib import Path

DATA_DIR = Path("data")
DATA_DIR.mkdir(parents=True, exist_ok=True)

RELICS_URL = "https://raw.githubusercontent.com/WFCD/warframe-relic-data/master/data/Relics.min.json"
WM_STATS_URL = "https://api.warframe.market/v1/items/{}/statistics"

def get_json(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))

def slugify_item_name(display_name: str) -> str:
    s = display_name.lower()
    s = s.replace("’","").replace("'","")
    s = s.replace("-", " ").strip()
    s = " ".join(s.split())
    return s.replace(" ", "_")

def main():
    print("Downloading relics…")
    relics = get_json(RELICS_URL, headers={"User-Agent": "relic-sorter-github-action"})
    (DATA_DIR / "Relics.min.json").write_text(json.dumps(relics), encoding="utf-8")

    items = set()
    for r in relics:
        drops = r.get("drops") or r.get("rewards") or []
        for d in drops:
            name = d.get("item") or d.get("name") or d.get("reward")
            if name:
                items.add(name)

    items = sorted(items)
    print(f"Unique items: {len(items)}")

    prices = {}
    for i, name in enumerate(items, start=1):
        url_name = slugify_item_name(name)
        url = WM_STATS_URL.format(url_name)

        try:
            js = get_json(url, headers={"Accept": "application/json", "User-Agent": "relic-sorter-github-action"})
            payload = js.get("payload", {})
            stats = payload.get("statistics", {})

            # We’ll default to PC stats because warframe.market pricing is most complete there.
            # If you later want console-only, we can change this.
            pc = stats.get("pc") or stats.get("PC") or []

            plat = None
            if pc:
                # Scan newest-ish entries and pick a median/avg style number
                for entry in reversed(pc):
                    for k in ("median", "avg_price", "average", "min_price", "max_price"):
                        v = entry.get(k)
                        if isinstance(v, (int, float)):
                            plat = float(v)
                            break
                    if plat is not None:
                        break

            if plat is not None:
                prices[name] = int(round(plat))

        except Exception:
            # item not found / endpoint mismatch / temporary issues -> skip
            pass

        if i % 50 == 0:
            print(f"Processed {i}/{len(items)}")
            time.sleep(1.0)

    (DATA_DIR / "prices.json").write_text(json.dumps(prices, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved prices for: {len(prices)} items")

if __name__ == "__main__":
    main()