#!/usr/bin/env python3
import json
import os
import time
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime

DATA_DIR = "data"
RELICS_OUT = os.path.join(DATA_DIR, "Relics.min.json")
PRICES_OUT = os.path.join(DATA_DIR, "prices.json")

# ✅ Reliable relic source (WFCD warframe-relic-data)
RELICS_URL = "https://raw.githubusercontent.com/WFCD/warframe-relic-data/master/data/Relics.min.json"

# ✅ Warframe.market API (IMPORTANT: includes /v1)
WM_BASE = "https://api.warframe.market/v1"
WM_ITEMS = f"{WM_BASE}/items"
WM_STATS = f"{WM_BASE}/items/{{url_name}}/statistics"

UA = "mosestyle-warframe-relic/1.0 (+github pages)"


def http_json(url: str, timeout: int = 60, retries: int = 3, backoff: float = 1.5):
    last_err = None
    for attempt in range(1, retries + 1):
        try:
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
        except urllib.error.HTTPError as e:
            last_err = e
            # Warframe.market sometimes rate-limits (429). Retry.
            if e.code in (429, 500, 502, 503, 504):
                sleep_s = backoff ** attempt
                print(f"HTTP {e.code} for {url} (attempt {attempt}/{retries}) -> sleeping {sleep_s:.1f}s")
                time.sleep(sleep_s)
                continue
            raise
        except Exception as e:
            last_err = e
            sleep_s = backoff ** attempt
            print(f"Error for {url} (attempt {attempt}/{retries}) -> sleeping {sleep_s:.1f}s")
            time.sleep(sleep_s)
            continue
    raise last_err


def ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


def build_relics_min():
    print("Downloading relics...")
    payload = http_json(RELICS_URL)

    if not isinstance(payload, list):
        raise RuntimeError("Unexpected relic JSON format: expected a list")

    # Keep it as-is (already in a compact format), but ensure stable ordering + keys we need.
    out = []
    for r in payload:
        name = r.get("name")
        rewards = r.get("rewards") or []
        if not name or not rewards:
            continue

        cleaned_rewards = []
        for rw in rewards:
            item = rw.get("item")
            chance = rw.get("chance")
            rtype = rw.get("type")  # Common/Uncommon/Rare in this dataset
            if not item:
                continue
            cleaned_rewards.append({"item": item, "chance": chance, "type": rtype})

        if cleaned_rewards:
            out.append({"name": name, "rewards": cleaned_rewards})

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
    print("Downloading warframe.market item list (name -> url_name)...")
    payload = http_json(WM_ITEMS)

    # warframe.market wraps responses in {"payload": {"items": [...]}}
    items = payload.get("payload", {}).get("items", [])
    if not items:
        raise RuntimeError("warframe.market /v1/items returned no items")

    mapping = {}
    for it in items:
        name = it.get("item_name")
        url_name = it.get("url_name")
        if name and url_name:
            mapping[name] = url_name

    print(f"WM items loaded: {len(mapping)}")
    return mapping


def parse_most_recent_90d_median(stats_payload):
    """
    stats payload shape:
    {
      "payload": {
        "statistics_closed": { "90days": [ { "datetime": "...", "median": ... }, ... ] },
        "statistics_live": ...
      }
    }
    """
    closed = stats_payload.get("payload", {}).get("statistics_closed", {})
    arr = closed.get("90days") or []
    if not arr:
        return None

    # Sort by datetime just to be safe
    def dt_key(x):
        d = x.get("datetime") or ""
        # API uses ISO date strings; safe-ish parse
        try:
            return datetime.fromisoformat(d.replace("Z", "+00:00"))
        except Exception:
            return d

    arr_sorted = sorted(arr, key=dt_key)
    latest = arr_sorted[-1]
    med = latest.get("median")
    if med is None:
        return None

    try:
        return int(round(float(med)))
    except Exception:
        return None


def build_prices_from_wm_90d_median(relics_min):
    reward_items = unique_reward_items(relics_min)
    print(f"Unique reward items to price: {len(reward_items)}")

    name_to_url = build_wm_name_to_urlname()

    prices = {}
    priced = 0
    skipped_no_map = 0

    for i, item_name in enumerate(reward_items, start=1):
        url_name = name_to_url.get(item_name)
        if not url_name:
            skipped_no_map += 1
            continue

        url = WM_STATS.format(url_name=url_name)
        try:
            stats = http_json(url, retries=4, backoff=1.7)
            median90 = parse_most_recent_90d_median(stats)
            if median90 is not None:
                prices[item_name] = median90
                priced += 1
        except Exception:
            # ignore single failures; we want "majority working"
            pass

        if i % 25 == 0:
            print(f"  {i}/{len(reward_items)} checked, priced={priced}, no_map={skipped_no_map}")

        # Be polite to the API (avoid 429)
        time.sleep(0.25)

    with open(PRICES_OUT, "w", encoding="utf-8") as f:
        json.dump(prices, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Prices written: {len(prices)} -> {PRICES_OUT}")

    if len(prices) < 100:
        raise RuntimeError(
            f"Too few prices ({len(prices)}). Could be rate limiting or mapping misses. Run workflow again."
        )


def main():
    ensure_data_dir()
    relics_min = build_relics_min()
    build_prices_from_wm_90d_median(relics_min)
    print("Done.")


if __name__ == "__main__":
    main()
