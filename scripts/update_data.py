#!/usr/bin/env python3
import json
import os
import time
import urllib.request
import urllib.error

DATA_DIR = "data"
RELICS_OUT = os.path.join(DATA_DIR, "Relics.min.json")
PRICES_OUT = os.path.join(DATA_DIR, "prices.json")

# ✅ Primary relic source (stable)
RELICS_MIN_URL = "https://raw.githubusercontent.com/WFCD/warframe-relic-data/master/data/Relics.min.json"

# Fallback relic source (format can vary)
RELICS_JSON_URL = "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/Relics.json"

# warframe.market API
WM_ITEMS = "https://api.warframe.market/v1/items"
WM_STATS = "https://api.warframe.market/v1/items/{url_name}/statistics"

UA = "mosestyle-warframe-relic/1.0 (+github pages)"


# ---------------- HTTP helpers ----------------
def http_json(url: str, timeout: int = 60, tries: int = 3, backoff: float = 1.25):
    last_err = None
    for i in range(tries):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": UA,
                    "Accept": "application/json,text/plain,*/*",
                    "Accept-Language": "en-US,en;q=0.9",
                },
            )
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read().decode("utf-8", errors="replace")
                return json.loads(raw)
        except Exception as e:
            last_err = e
            time.sleep(backoff * (i + 1))
    raise last_err


def ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


# ---------------- Relics build ----------------
def normalize_relic_name(obj):
    """
    Try to return a display name like: "Axi A1"
    """
    n = obj.get("name")
    if isinstance(n, str) and n.strip():
        return " ".join(n.strip().split())

    tier = obj.get("tier") or obj.get("era") or obj.get("group")
    code = obj.get("relicName") or obj.get("relic_name") or obj.get("code") or obj.get("key")
    if tier and code:
        return f"{str(tier).strip()} {str(code).strip()}"

    return None


def normalize_rewards_list(relic_obj):
    """
    Returns list of reward dicts with:
      {"item": "...", "chance": float/int/None, "type": "Common/Rare/Uncommon/..." }
    Handles both 'rewards' and 'drops' keys.
    """
    rewards = relic_obj.get("rewards")
    if not rewards:
        rewards = relic_obj.get("drops")
    if not rewards:
        return []

    out = []
    for rw in rewards:
        if not isinstance(rw, dict):
            continue
        item = rw.get("item") or rw.get("itemName") or rw.get("name") or rw.get("reward")
        chance = rw.get("chance") or rw.get("dropChance") or rw.get("probability")
        rtype = rw.get("rarity") or rw.get("type") or rw.get("tier")

        if not item:
            continue

        out.append({"item": item, "chance": chance, "type": rtype})
    return out


def build_relics_min():
    """
    Writes data/Relics.min.json as:
      [{"name":"Axi A1","rewards":[{"item":"...", "chance":..., "type":"..."}]}, ...]
    """
    # ✅ Try stable WFCD relic-data first (already min)
    print("Downloading relics (primary: WFCD warframe-relic-data Relics.min.json)...")
    try:
        payload = http_json(RELICS_MIN_URL)
        if isinstance(payload, list) and len(payload) > 0:
            out = []
            for r in payload:
                if not isinstance(r, dict):
                    continue
                name = normalize_relic_name(r)
                rewards = normalize_rewards_list(r)

                # NOTE: WFCD relic-data min usually has "rewards" already
                if not name:
                    continue
                if not rewards:
                    # Some entries may be odd — skip them
                    continue

                out.append({"name": name, "rewards": rewards})

            out.sort(key=lambda x: x["name"])
            with open(RELICS_OUT, "w", encoding="utf-8") as f:
                json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
            print(f"Relics written: {len(out)} -> {RELICS_OUT}")
            return out
        else:
            print("Primary relic source returned empty/unexpected. Falling back...")
    except Exception as e:
        print(f"Primary relic source failed: {e}. Falling back...")

    # Fallback: WFCD warframe-items Relics.json
    print("Downloading relics (fallback: WFCD warframe-items Relics.json)...")
    payload = http_json(RELICS_JSON_URL)

    if isinstance(payload, dict) and "relics" in payload:
        relics = payload["relics"]
    elif isinstance(payload, list):
        relics = payload
    else:
        raise RuntimeError("Unexpected relic JSON format from fallback source.")

    out = []
    for r in relics:
        if not isinstance(r, dict):
            continue
        name = normalize_relic_name(r)
        rewards = normalize_rewards_list(r)

        if not name or not rewards:
            continue

        out.append({"name": name, "rewards": rewards})

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
    pl = stats_payload.get("payload")
    if not isinstance(pl, dict):
        return None

    stats = pl.get("statistics_closed") or pl.get("statistics_live")
    if not isinstance(stats, dict):
        return None

    arr = stats.get("90days")
    if not isinstance(arr, list) or not arr:
        return None

    last = arr[-1]
    if not isinstance(last, dict):
        return None

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

    name_to_url = build_wm_name_to_urlname()

    prices = {}
    priced = 0
    missing_map = 0
    missing_stats = 0

    for i, item_name in enumerate(reward_items, start=1):
        url_name = name_to_url.get(item_name)
        if not url_name:
            missing_map += 1
            continue

        try:
            med = fetch_wm_90d_median(url_name)
            if med is None:
                missing_stats += 1
            else:
                prices[item_name] = med
                priced += 1
        except urllib.error.HTTPError as e:
            if e.code == 404:
                missing_stats += 1
            else:
                missing_stats += 1
        except Exception:
            missing_stats += 1

        if i % 20 == 0:
            print(f"  {i}/{len(reward_items)} checked • priced={priced} • no_map={missing_map} • no_stats={missing_stats}")

        time.sleep(0.25)

    with open(PRICES_OUT, "w", encoding="utf-8") as f:
        json.dump(prices, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Prices written: {len(prices)} -> {PRICES_OUT}")
    print(f"Missing mapping (name not found on WM): {missing_map}")
    print(f"Missing median (no stats / errors): {missing_stats}")

    if len(prices) < 50:
        raise RuntimeError(
            f"Too few prices ({len(prices)}). "
            f"Likely WM API blocked/rate-limited or endpoint wrong. "
            f"Check WM_ITEMS is exactly: {WM_ITEMS}"
        )


def main():
    ensure_data_dir()

    relics_min = build_relics_min()

    # ✅ keep this safety (but now it shouldn't trigger)
    if not relics_min:
        raise RuntimeError("Relics list is empty after parsing. Aborting so we don't publish [].")

    build_prices_from_wm_90d_median(relics_min)
    print("Done.")


if __name__ == "__main__":
    main()
