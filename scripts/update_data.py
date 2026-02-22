#!/usr/bin/env python3
import json
import os
import time
import urllib.parse
import urllib.request
import urllib.error

DATA_DIR = "data"
RELICS_OUT = os.path.join(DATA_DIR, "Relics.min.json")
PRICES_OUT = os.path.join(DATA_DIR, "prices.json")

# Relic source (keep this one if it already works for you)
RELICS_URL = "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/Relics.json"

# Warframe Analytics endpoints
ITEMS_PAGED = "https://warframe-analytics.com/api/v1/items/paged"
ITEM_BY_NAME = "https://warframe-analytics.com/api/v1/items/byName"

UA = "mosestyle-warframe-relic/1.2 (+github pages)"


def http_json(url: str, timeout: int = 60):
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
    payload = http_json(RELICS_URL)

    # WFCD Relics.json can be a dict {"relics":[...]} OR a list directly
    if isinstance(payload, dict) and "relics" in payload:
        relics = payload["relics"]
    elif isinstance(payload, list):
        relics = payload
    else:
        raise RuntimeError("Unexpected relic JSON format")

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
            out_rewards.append({"item": item, "chance": chance, "type": rtype})

        if out_rewards:
            out.append({"name": name, "rewards": out_rewards})

    out.sort(key=lambda x: x["name"])

    with open(RELICS_OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Relics written: {len(out)} -> {RELICS_OUT}")
    return out


def unique_reward_items(relics_min):
    s = set()
    for r in relics_min:
        for rw in r.get("rewards", []):
            it = rw.get("item")
            if it:
                s.add(it)
    return sorted(s)


def try_paged_download():
    """
    Try a few common pagination schemes.
    If none works, return None so we fallback to byName.
    """
    print("Trying to download ALL prices via /items/paged pagination...")

    # First call to learn total + first page
    base = http_json(ITEMS_PAGED)
    total = base.get("total")
    items0 = base.get("items") or []
    if not items0 or not total:
        print("Paged endpoint returned no items/total; will fallback.")
        return None

    # Helper: convert items -> dict
    def items_to_prices(items):
        d = {}
        for it in items:
            name = it.get("item_name")
            plat = it.get("platinum")
            if not name or plat is None:
                continue
            d[name] = int(round(float(plat)))
        return d

    prices = items_to_prices(items0)

    # If total <= len(items0) we already have all
    if total <= len(items0):
        print(f"Got all items in one page: {len(items0)}/{total}")
        return prices

    page_size = len(items0)

    # Different query styles to test
    # We detect success if "page 2" first item is DIFFERENT than page 1 first item.
    first_item_page1 = items0[0].get("item_name")

    candidates = [
        lambda page: f"{ITEMS_PAGED}?page={page}&pageSize={page_size}",
        lambda page: f"{ITEMS_PAGED}?page={page}&perPage={page_size}",
        lambda page: f"{ITEMS_PAGED}?page={page}&limit={page_size}",
        # offset/limit styles
        lambda page: f"{ITEMS_PAGED}?offset={(page-1)*page_size}&limit={page_size}",
        lambda page: f"{ITEMS_PAGED}?skip={(page-1)*page_size}&take={page_size}",
    ]

    working = None
    for make_url in candidates:
        try:
            test = http_json(make_url(2))
            items2 = test.get("items") or []
            if not items2:
                continue
            first_item_page2 = items2[0].get("item_name")
            if first_item_page2 and first_item_page2 != first_item_page1:
                working = make_url
                print("✅ Pagination scheme works!")
                break
        except Exception:
            continue

    if not working:
        print("❌ Could not find a working pagination scheme for /items/paged.")
        return None

    # Now fetch all pages
    pages = (total + page_size - 1) // page_size
    for page in range(2, pages + 1):
        url = working(page)
        payload = http_json(url)
        items = payload.get("items") or []
        if not items:
            print(f"Stopped early at page {page}: empty items")
            break
        prices.update(items_to_prices(items))
        print(f"  page {page}/{pages}: total prices={len(prices)}")
        time.sleep(0.2)

    return prices


def fetch_by_name(item_name: str):
    q = urllib.parse.urlencode({"name": item_name})
    url = f"{ITEM_BY_NAME}?{q}"
    payload = http_json(url)
    # Expected single item object
    name = payload.get("item_name") or item_name
    plat = payload.get("platinum")
    if plat is None:
        return None
    return name, int(round(float(plat)))


def build_prices(relics_min):
    # Attempt full paged download first
    prices = try_paged_download()

    if prices is not None and len(prices) >= 200:
        print(f"Using paged prices: {len(prices)} entries")
    else:
        # Fallback: only fetch prices for the items that appear in your relic rewards.
        # This is slower but VERY reliable.
        reward_items = unique_reward_items(relics_min)
        print(f"Falling back to byName for reward items: {len(reward_items)} items")

        prices = {}
        ok = 0
        for i, name in enumerate(reward_items, start=1):
            try:
                res = fetch_by_name(name)
                if res:
                    k, v = res
                    prices[k] = v
                    ok += 1
            except Exception:
                pass

            if i % 25 == 0:
                print(f"  {i}/{len(reward_items)} looked up, priced={ok}")
            time.sleep(0.25)

        print(f"Fallback byName done: priced={len(prices)}/{len(reward_items)}")

    with open(PRICES_OUT, "w", encoding="utf-8") as f:
        json.dump(prices, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Prices written: {len(prices)} -> {PRICES_OUT}")

    if len(prices) < 100:
        raise RuntimeError(
            f"Too few prices ({len(prices)}). API might be blocking. Try running workflow again."
        )


def main():
    ensure_data_dir()
    relics_min = build_relics_min()
    build_prices(relics_min)
    print("Done.")


if __name__ == "__main__":
    main()
