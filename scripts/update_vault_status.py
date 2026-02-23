#!/usr/bin/env python3
import json
import os
import re
import time
import html
import urllib.request
import urllib.error
from datetime import datetime
from typing import Any, Dict, List, Set, Tuple

DATA_DIR = "data"
RELICS_IN = os.path.join(DATA_DIR, "Relics.min.json")
VAULT_OUT = os.path.join(DATA_DIR, "vaultStatus.json")

# NOTE:
# You asked for https://wiki.warframe.com/w/Void_Relic, but that site is often not friendly to automated fetches.
# The Fandom page contains the exact "Unvaulted/Available Relics" list and is reliably fetchable in GitHub Actions.
WIKI_URL = "https://warframe.fandom.com/wiki/Void_Relic"

UA = "mosestyle-warframe-relic/vaulter (+github actions)"
HTTP_TIMEOUT = 60


def ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


def http_text(url: str, timeout: int = HTTP_TIMEOUT, attempts: int = 4) -> str:
    last_err = None
    for i in range(attempts):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": UA,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Connection": "close",
                },
            )
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read().decode("utf-8", errors="replace")
                return raw
        except urllib.error.HTTPError as e:
            last_err = e
            # Retry transient errors
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(1.5 ** i)
                continue
            raise
        except Exception as e:
            last_err = e
            time.sleep(1.5 ** i)
    if last_err:
        raise last_err
    raise RuntimeError("http_text failed with unknown error")


# ---- Natural relic ordering (same idea as in your app.js) ----
ERA_ORDER = {"Lith": 0, "Meso": 1, "Neo": 2, "Axi": 3, "Requiem": 4}


def parse_relic_name(s: str) -> Tuple[int, str, int, str]:
    """
    "Axi A20" -> (eraOrder, letters, num, tail)
    """
    s = (s or "").strip()
    m = re.match(r"^(\w+)\s+([A-Za-z]+)(\d+)([A-Za-z]*)$", s)
    if not m:
        return (999, s, 0, "")
    era = m.group(1)
    letters = m.group(2)
    num = int(m.group(3)) if m.group(3).isdigit() else 0
    tail = m.group(4) or ""
    return (ERA_ORDER.get(era, 99), letters.upper(), num, tail.upper())


def relic_sort_key(name: str):
    era_ord, letters, num, tail = parse_relic_name(name)
    return (era_ord, letters, num, tail, name)


def load_relic_names_from_relics_min() -> List[str]:
    with open(RELICS_IN, "r", encoding="utf-8") as f:
        data = json.load(f)

    names: List[str] = []
    for r in data:
        if not isinstance(r, dict):
            continue
        tier = (r.get("tier") or r.get("era") or "").strip()
        nm = (r.get("name") or r.get("relicName") or r.get("code") or "").strip()
        if tier and nm:
            names.append(f"{tier} {nm}".strip())
    return sorted(set(names), key=relic_sort_key)


def extract_unvaulted_available_relics(html_text: str) -> Set[str]:
    """
    Extract ONLY the relic names listed in the "Unvaulted/Available Relics" section.
    We intentionally *do not* scrape the entire page for relic-like strings.
    """
    t = html_text

    # Make it easier to regex: unescape entities and collapse whitespace
    t = html.unescape(t)
    t = re.sub(r"\s+", " ", t)

    # Find the section near "Unvaulted/Available Relics"
    idx = t.lower().find("unvaulted/available relics".lower())
    if idx == -1:
        return set()

    # Take a limited window after that phrase to avoid catching the whole page
    window = t[idx : idx + 20000]

    # Relic name pattern like "Lith K12"
    # This will only match inside that window.
    pat = re.compile(r"\b(Lith|Meso|Neo|Axi|Requiem)\s+([A-Za-z]+\d+[A-Za-z]*)\b")
    found = set()
    for era, code in pat.findall(window):
        found.add(f"{era} {code}")

    return found


def main():
    ensure_data_dir()

    if not os.path.exists(RELICS_IN):
        raise RuntimeError(f"Missing {RELICS_IN}. Run update_data.py workflow first.")

    all_relics = load_relic_names_from_relics_min()
    print(f"Relics loaded: {len(all_relics)}")

    print(f"Fetching Unvaulted/Available relic list from: {WIKI_URL}")
    page = http_text(WIKI_URL)

    available_set = extract_unvaulted_available_relics(page)
    print(f"Available relics found in table: {len(available_set)}")

    if len(available_set) < 10:
        # Safety: if the page layout changed or we got blocked, don't publish nonsense
        raise RuntimeError(
            f"Too few available relics detected ({len(available_set)}). Page structure may have changed."
        )

    # Build FULL mapping for every relic we have:
    # true = available/unvaulted (in table)
    # false = everything else
    mapping: Dict[str, bool] = {}
    for name in sorted(all_relics, key=relic_sort_key):
        mapping[name] = (name in available_set)

    out = {
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d"),
        "available": mapping,  # <-- app.js can read VAULT.available["Lith K12"] etc
    }

    with open(VAULT_OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    trues = sum(1 for v in mapping.values() if v)
    falses = len(mapping) - trues
    print(f"vaultStatus written: {VAULT_OUT} (available=true: {trues}, vaulted=false: {falses})")


if __name__ == "__main__":
    main()
