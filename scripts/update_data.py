#!/usr/bin/env python3
import json
import os
import time
import urllib.request
import urllib.error

DATA_DIR = "data"
RELICS_OUT = os.path.join(DATA_DIR, "Relics.min.json")
PRICES_OUT = os.path.join(DATA_DIR, "prices.json")

# Your relic source (keep whatever you already used that works)
# If your script already has a different RELICS_URL that works, keep it.
RELICS_URL = "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/Relics.json"

# NEW price source (works reliably from GitHub Actions)
WF_ANALYTICS_ITEMS_PAGED = "https://warframe-analytics.com/api/v1/items/paged"

UA = "mosestyle-warframe-relic/1.0 (+github pages)"


def get_json(url: str, timeout: int = 60):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "application/json,text/plain,*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode("utf-8", errors="replace")
        return json.loads(raw)


def ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


def build_relics_min():
    print("Downloading relics...")
    relics_payload = get_json(RELICS_URL)

    # WFCD Relics.json is typically a dict with a "relics" list, OR directly a list.
    if isinstance(relics_payload, dict) and "relics" in relics_payload:
        relics = relics_payload["relics"]
    elif isinstance(relics_payload, list):
        relics = relics_payload
    else:
        raise RuntimeError("Unexpected relic JSON format")

    # Keep only what the site needs (small file)
    out = []
    for r in relics:
        name = r.get("name")
        rewards = r.get("rewards") or []
        if not name or not rewards:
            continue

        out_rewards = []
        for rw in rewards:
            item = rw.get("item") or rw.get("itemName") or rw.get("name")
            chance = rw.get("chance")
            rtype = rw.get("rarity") or rw.get("type")
            if not item:
                continue
            out_rewards.append(
                {
                    "item": item,
                    "chance": chance,
                    "type": rtype,
                }
            )

        if out_rewards:
            out.append({"name": name, "rewards": out_rewards})

    out.sort(key=lambda x: x["name"])

    with open(RELICS_OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Relics written: {len(out)} -> {RELICS_OUT}")


def build_prices():
    print("Downloading prices from Warframe Analytics...")

    prices = {}

    page = 1
    page_size = 200  # big page for fewer requests

    total = None
    got = 0

    while True:
        url = f"{WF_ANALYTICS_ITEMS_PAGED}?page={page}&pageSize={page_size}"
        payload = get_json(url)

        if total is None:
            total = payload.get("total")

        items = payload.get("items") or []
        if not items:
            break

        for it in items:
            name = it.get("item_name")
            plat = it.get("platinum")
            if not name or plat is None:
                continue

            # Keep it clean: round to nearest int (or change to 1 decimal if you prefer)
            prices[name] = int(round(float(plat)))

        got += len(items)
        print(f"  page {page}: +{len(items)} items (seen {got}/{total if total else '?'})")

        page += 1
        time.sleep(0.15)  # be polite

        # safety stop
        if page > 50:
            break

    with open(PRICES_OUT, "w", encoding="utf-8") as f:
        json.dump(prices, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Prices written: {len(prices)} -> {PRICES_OUT}")

    # IMPORTANT: fail the build if we somehow got nothing
    if len(prices) < 50:
        raise RuntimeError(f"Too few prices ({len(prices)}). Something went wrong.")


def main():
    ensure_data_dir()
    build_relics_min()
    build_prices()
    print("Done.")


if __name__ == "__main__":
    main()
