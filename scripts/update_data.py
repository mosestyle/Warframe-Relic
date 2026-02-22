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

# Relic source (WFCD)
RELICS_URL = "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/Relics.json"

# warframe.market API
WM_ITEMS = "https://api.warframe.market/v1/items"
WM_STATS = "https://api.warframe.market/v1/items/{url_name}/statistics"

UA = "mosestyle-warframe-relic/2.0 (+github pages)"


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


def build_wm_name_to_urlname():
    """
    Download warframe.market items list and build:
      display name -> url_name
    """
    print("Downloading warframe.market item list (name -> url_name)...")
    payload = http_json(WM_ITEMS)

    # Expected: payload.items = [{item_name, url_name}, ...]
    items = (
        payload.get("payload", {}).get("items")
        if isinstance(payload, dict)
        else None
    )
    if not items:
        raise RuntimeError("warframe.market /v1/items returned no items")

    mapping = {}
    for it in items:
        n = it.get("item_name")
        u = it.get("url_name")
        if n and u:
            mapping[n] = u

    print(f"warframe.market items: {len(mapping)}")
    return mapping


def wm_90day_median(url_name: str):
    """
    Return most recent 90-day median for this item, or None if missing.
    """
    url = WM_STATS.format(url_name=urllib.parse.quote(url_name))
    payload = http_json(url)

    stats_closed = payload.get("payload", {}).get("statistics_closed", {})
    arr = stats_closed.get("90days") or []

    if not arr:
        return None

    last = arr[-1]
    med = last.get("median")
    if med is None:
        return None

    # warframe.market medians can be float-ish; we store int plat
    try:
        return int(round(float(med)))
    except Exception:
        return None


def build_prices_from_wm(relics_min):
    reward_items = unique_reward_items(relics_min)
    print(f"Unique reward items to price: {len(reward_items)}")

    name_to_url = build_wm_name_to_urlname()

    prices = {}
    missing_map = 0
    missing_stats = 0

    # Stay under rate limit (warframe.market commonly blocks if spammed)
    # ~2.5 req/s is usually safe
    delay = 0.40

    for i, name in enumerate(reward_items, start=1):
        url_name = name_to_url.get(name)
        if not url_name:
            missing_map += 1
            continue

        try:
            med = wm_90day_median(url_name)
            if med is None:
                missing_stats += 1
            else:
                prices[name] = med
        except Exception:
            # Cloudflare / random transient errors
            missing_stats += 1

        if i % 25 == 0:
            print(
                f"  {i}/{len(reward_items)} checked | priced={len(prices)} | "
                f"no-map={missing_map} | no-stats={missing_stats}"
            )

        time.sleep(delay)

    with open(PRICES_OUT, "w", encoding="utf-8") as f:
        json.dump(prices, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Prices written: {len(prices)} -> {PRICES_OUT}")
    print(f"Missing url_name mapping: {missing_map}")
    print(f"Missing stats/median: {missing_stats}")

    # Don’t hard-fail if coverage is “majority”; adjust threshold if you want stricter.
    if len(prices) < 50:
        raise RuntimeError(
            f"Too few prices ({len(prices)}). warframe.market may be blocking the runner."
        )


def main():
    ensure_data_dir()
    relics_min = build_relics_min()
    build_prices_from_wm(relics_min)
    print("Done.")


if __name__ == "__main__":
    main()
