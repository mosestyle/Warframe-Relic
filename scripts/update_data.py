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

# Relic source
RELICS_URL = "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/Relics.json"

# warframe.market API
WM_ITEMS = "https://api.warframe.market/v1/items"
WM_STATS = "https://api.warframe.market/v1/items/{url_name}/statistics"

UA = "mosestyle-warframe-relic/1.0 (+github pages)"


# ---------------- HTTP helpers ----------------
def http_json(url: str, timeout: int = 60, tries: int = 3, backoff: float = 1.2):
    last_err = None
    for i in range(tries):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": UA,
                    "Accept": "application/json,text/plain,*/*",
                    # Warframe.market sometimes varies response by language;
                    # EN tends to be safest for item_name matching.
                    "Accept-Language": "en-US,en;q=0.9",
                },
            )
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read().decode("utf-8", errors="replace")
                return json.loads(raw)
        except Exception as e:
            last_err = e
            # gentle backoff
            time.sleep(backoff * (i + 1))
    raise last_err


def ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


# ---------------- Relics build ----------------
def build_relics_min():
    print("Downloading relics...")
    payload = http_json(RELICS_URL)

    # WFCD Relics.json can be {"relics":[...]} OR a list
    if isinstance(payload, dict) and "relics" in payload:
        relics = payload["relics"]
    elif isinstance(payload, list):
        relics = payload
    else:
        raise RuntimeError("Unexpected relic JSON format (expected list or dict with 'relics').")

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


# ---------------- warframe.market name→url_name ----------------
def build_wm_name_to_urlname():
    print("Downloading warframe.market item list (name -> url_name)...")
    payload = http_json(WM_ITEMS)

    # Expected: {"payload":{"items":[{"item_name":"...", "url_name":"..."}]}}
    pl = payload.get("payload") if isinstance(payload, dict) else None
    items = (pl or {}).get("items") if isinstance(pl, dict) else None
    if not items:
        raise RuntimeError("warframe.market /v1/items returned unexpected format (no payload.items).")

    name_to_url = {}
    for it in items:
        nm = it.get("item_name")
        un = it.get("url_name")
        if nm and un:
            name_to_url[nm] = un

    print(f"warframe.market items loaded: {len(name_to_url)}")
    return name_to_url


# ---------------- warframe.market 90-day median ----------------
def parse_90d_median(stats_payload: dict):
    """
    warframe.market statistics response usually looks like:
      {"payload":{"statistics_closed":{"90days":[{...,"median":X,...}, ...]}}}
    Sometimes statistics_live exists too.

    We want: MOST RECENT 90days median.
    """
    if not isinstance(stats_payload, dict):
        return None

    pl = stats_payload.get("payload")
    if not isinstance(pl, dict):
        return None

    # prefer "statistics_closed" (completed trades) for more stable median
    stats = pl.get("statistics_closed") or pl.get("statistics_live")
    if not isinstance(stats, dict):
        return None

    arr = stats.get("90days")
    if not isinstance(arr, list) or not arr:
        return None

    # Take the last element as "most recent" (what WM typically returns)
    last = arr[-1]
    if not isinstance(last, dict):
        return None

    # warframe.market uses key "median"
    med = last.get("median")
    if med is None:
        return None

    try:
        return int(round(float(med)))
    except Exception:
        return None


def fetch_wm_90d_median(url_name: str):
    url = WM_STATS.format(url_name=url_name)
    payload = http_json(url, tries=3, backoff=1.5)
    return parse_90d_median(payload)


def build_prices_from_wm_90d_median(relics_min):
    reward_items = unique_reward_items(relics_min)
    print(f"Unique reward items to price: {len(reward_items)}")

    # Build mapping once
    name_to_url = build_wm_name_to_urlname()

    prices = {}
    priced = 0
    missing_map = 0
    missing_stats = 0

    for i, item_name in enumerate(reward_items, start=1):
        url_name = name_to_url.get(item_name)

        if not url_name:
            missing_map += 1
            # Skip items WM doesn't know by exact name
            continue

        try:
            med = fetch_wm_90d_median(url_name)
            if med is None:
                missing_stats += 1
            else:
                prices[item_name] = med
                priced += 1
        except urllib.error.HTTPError as e:
            # 404 usually means bad endpoint or url_name missing
            if e.code == 404:
                missing_stats += 1
            else:
                # other HTTP errors: treat as transient
                missing_stats += 1
        except Exception:
            missing_stats += 1

        if i % 20 == 0:
            print(f"  {i}/{len(reward_items)} checked • priced={priced} • no_map={missing_map} • no_stats={missing_stats}")

        # Be gentle to WM
        time.sleep(0.25)

    with open(PRICES_OUT, "w", encoding="utf-8") as f:
        json.dump(prices, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Prices written: {len(prices)} -> {PRICES_OUT}")
    print(f"Missing mapping (name not found on WM): {missing_map}")
    print(f"Missing median (no stats / errors): {missing_stats}")

    # If it looks totally broken, fail the workflow so you notice
    if len(prices) < 50:
        raise RuntimeError(
            f"Too few prices ({len(prices)}). "
            f"Likely WM API blocked/rate-limited or endpoint wrong. "
            f"Check WM_ITEMS is exactly: {WM_ITEMS}"
        )


def main():
    ensure_data_dir()

    relics_min = build_relics_min()

    # Safety check: if relics are empty, stop (prevents wiping your Relics.min.json to [])
    if not relics_min:
        raise RuntimeError("Relics list is empty after parsing. Aborting so we don't publish [].")

    build_prices_from_wm_90d_median(relics_min)
    print("Done.")


if __name__ == "__main__":
    main()
