#!/usr/bin/env python3
import json
import os
import re
import time
import urllib.parse
import urllib.request
import urllib.error
from typing import Any, Dict, List, Optional

DATA_DIR = "data"
RELICS_OUT = os.path.join(DATA_DIR, "Relics.min.json")
PRICES_OUT = os.path.join(DATA_DIR, "prices.json")

# --- Relics sources ---
# Primary: WFCD warframe-relic-data (already "min-ish")
RELICS_MIN_URL_PRIMARY = (
    "https://raw.githubusercontent.com/WFCD/warframe-relic-data/master/data/Relics.min.json"
)
# Fallback: WFCD warframe-items Relics.json (different structure)
RELICS_URL_FALLBACK = (
    "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/Relics.json"
)

# --- Warframe.market endpoints ---
# Keep using v1 statistics endpoint (your current design),
# but we STOP using /v1/items because it can 404 / change.
WM_BASE = "https://api.warframe.market/v1"
WM_ITEM_STATS = f"{WM_BASE}/items/{{url_name}}/statistics"  # statistics for a specific item

UA = "mosestyle-warframe-relic/2.1 (+github pages actions)"

# Warframe.market headers that are often expected
WM_PLATFORM = "pc"
WM_LANGUAGE = "en"

# Throttling (be gentle in GitHub Actions)
SLEEP_BETWEEN_WM_CALLS = 0.40  # ~2.5 req/sec
HTTP_TIMEOUT = 60


def ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


def http_json(url: str, timeout: int = HTTP_TIMEOUT, attempts: int = 4) -> Any:
    """
    Fetch JSON with retries/backoff.
    Handles transient 429/5xx/connection issues.
    """
    last_err = None
    for i in range(attempts):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": UA,
                    "Accept": "application/json,text/plain,*/*",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Connection": "close",
                    # WM-specific headers
                    "Platform": WM_PLATFORM,
                    "Language": WM_LANGUAGE,
                },
            )
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read().decode("utf-8", errors="replace")
                return json.loads(raw)

        except urllib.error.HTTPError as e:
            last_err = e
            # Retry on rate-limit / transient server errors
            if e.code in (429, 500, 502, 503, 504):
                backoff = 1.5 ** i
                time.sleep(backoff)
                continue
            # For 404 etc, don’t hammer
            raise

        except Exception as e:
            last_err = e
            backoff = 1.5 ** i
            time.sleep(backoff)

    if last_err:
        raise last_err
    raise RuntimeError("http_json failed with unknown error")


# -------------------- Relics parsing --------------------

def relic_display_name_from_min(obj: Dict[str, Any]) -> str:
    """
    Normalize to: "Axi A2" style names if possible.
    warframe-relic-data Relics.min.json typically uses keys like:
      { "name": "A2", "tier": "Axi" }
    """
    tier = (obj.get("tier") or obj.get("era") or "").strip()
    name = (obj.get("name") or obj.get("relicName") or "").strip()

    # If name already includes tier (e.g. "Axi A2"), keep it
    if tier and name and name.lower().startswith(tier.lower()):
        return re.sub(r"\s+", " ", name).strip()

    full = f"{tier} {name}".strip()
    return re.sub(r"\s+", " ", full).strip()


def build_relics_min() -> List[Dict[str, Any]]:
    """
    Writes data/Relics.min.json in our app format:
    [
      {"name":"Axi A2","rewards":[{"item":"Aklex Prime Link","chance":0.11,"type":"Uncommon"}, ...]},
      ...
    ]
    """
    print("Downloading relics (primary: WFCD warframe-relic-data Relics.min.json)...")
    payload = None
    try:
        payload = http_json(RELICS_MIN_URL_PRIMARY)
    except Exception as e:
        print(f"Primary relics source failed: {e}")
        payload = None

    relics_raw: List[Dict[str, Any]] = []

    if isinstance(payload, list) and payload:
        relics_raw = payload
    else:
        print("Falling back to WFCD warframe-items Relics.json...")
        payload2 = http_json(RELICS_URL_FALLBACK)

        if isinstance(payload2, dict) and "relics" in payload2 and isinstance(payload2["relics"], list):
            relics_raw = payload2["relics"]
        elif isinstance(payload2, list):
            relics_raw = payload2
        else:
            raise RuntimeError("Unexpected relic JSON format from fallback source")

    out: List[Dict[str, Any]] = []

    for r in relics_raw:
        if not isinstance(r, dict):
            continue

        rewards = r.get("rewards") or r.get("drops") or []
        if not isinstance(rewards, list) or not rewards:
            continue

        # Determine display name
        if "tier" in r or "era" in r:
            relic_name = relic_display_name_from_min(r)
        else:
            relic_name = (r.get("name") or "").strip()
            relic_name = re.sub(r"\s+", " ", relic_name)

        if not relic_name:
            continue

        out_rewards = []
        for rw in rewards:
            if not isinstance(rw, dict):
                continue
            item = (rw.get("item") or rw.get("itemName") or rw.get("name") or "").strip()
            if not item:
                continue
            chance = rw.get("chance")
            rtype = rw.get("rarity") or rw.get("type") or rw.get("tier")
            out_rewards.append({"item": item, "chance": chance, "type": rtype})

        if out_rewards:
            out.append({"name": relic_name, "rewards": out_rewards})

    out.sort(key=lambda x: x["name"])

    ensure_data_dir()
    with open(RELICS_OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Relics written: {len(out)} -> {RELICS_OUT}")

    # Safety: do not publish empty []
    if len(out) == 0:
        raise RuntimeError("Relics list is empty after parsing. Aborting so we don't publish [].")

    return out


def unique_reward_items(relics_min: List[Dict[str, Any]]) -> List[str]:
    s = set()
    for r in relics_min:
        for rw in r.get("rewards", []):
            it = rw.get("item")
            if it:
                s.add(it)
    return sorted(s)


# -------------------- Warframe.market pricing --------------------

def guess_wm_url_name(item_name: str) -> str:
    """
    warframe.market url_name is typically:
      lowercase + underscores, stripping punctuation.

    Examples:
      "Nikana Prime Blueprint" -> "nikana_prime_blueprint"
      "Aklex Prime Link" -> "aklex_prime_link"
    """
    s = (item_name or "").strip().lower()
    s = s.replace("&", "and")
    s = re.sub(r"[^a-z0-9]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s


# If you ever find specific items that don't match the guessed format,
# put them here (key = item display name from relic data, value = WM url_name)
WM_URL_OVERRIDES: Dict[str, str] = {
    # "Some Weird Name": "some_weird_url_name",
}


def wm_90day_median(url_name: str) -> Optional[int]:
    """
    Reads warframe.market statistics and returns most recent 90-day median (closed stats).
    Endpoint:
      /v1/items/{url_name}/statistics

    Expected:
      payload.statistics_closed['90days'] -> list of objects with 'median'
    """
    url = WM_ITEM_STATS.format(url_name=urllib.parse.quote(url_name))
    try:
        payload = http_json(url)
    except urllib.error.HTTPError as e:
        # Many items won't exist or won't have stats -> skip instead of failing workflow
        if e.code == 404:
            return None
        raise

    try:
        stats_closed = payload["payload"]["statistics_closed"]
        arr_90 = stats_closed.get("90days") or []
        if not arr_90:
            return None

        last = arr_90[-1]  # most recent
        med = last.get("median")
        if med is None:
            return None

        return int(round(float(med)))
    except Exception:
        return None


def build_prices_from_wm_90d_median(relics_min: List[Dict[str, Any]]) -> Dict[str, int]:
    reward_items = unique_reward_items(relics_min)
    print(f"Unique reward items to price: {len(reward_items)}")

    prices: Dict[str, int] = {}
    missing_or_notfound = 0

    for i, item_name in enumerate(reward_items, start=1):
        url_name = WM_URL_OVERRIDES.get(item_name) or guess_wm_url_name(item_name)

        try:
            med = wm_90day_median(url_name)
        except urllib.error.HTTPError as e:
            # If we get rate-limited despite throttling, treat as transient failure
            # and count it as missing rather than killing the deployment.
            if e.code in (429, 500, 502, 503, 504):
                missing_or_notfound += 1
                time.sleep(1.25)
                med = None
            else:
                raise

        if med is None:
            missing_or_notfound += 1
        else:
            prices[item_name] = med

        if i % 25 == 0:
            print(f"  {i}/{len(reward_items)} priced={len(prices)} (missing/notfound={missing_or_notfound})")

        time.sleep(SLEEP_BETWEEN_WM_CALLS)

    print(f"WM pricing done: {len(prices)}/{len(reward_items)} priced. Missing/NotFound={missing_or_notfound}")
    return prices


# -------------------- Main --------------------

def main():
    relics_min = build_relics_min()

    prices = build_prices_from_wm_90d_median(relics_min)

    ensure_data_dir()
    with open(PRICES_OUT, "w", encoding="utf-8") as f:
        json.dump(prices, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Prices written: {len(prices)} -> {PRICES_OUT}")

    # Safety: if something went wrong and we priced almost nothing, fail the workflow
    if len(prices) < 25:
        raise RuntimeError(
            f"Too few prices ({len(prices)}). warframe.market calls may be failing, or endpoint changed."
        )

    print("Done.")


if __name__ == "__main__":
    main()
