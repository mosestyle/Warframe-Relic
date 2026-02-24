#!/usr/bin/env python3
import json
import os
import re
import time
import urllib.request
import urllib.error
from datetime import datetime
from typing import Dict, List, Set, Tuple

DATA_DIR = "data"
RELICS_IN = os.path.join(DATA_DIR, "Relics.min.json")
VAULT_OUT = os.path.join(DATA_DIR, "vaultStatus.json")

# Use the official Warframe wiki (NOT Fandom) to avoid 403 in GitHub Actions.
WIKI_URLS = [
    "https://wiki.warframe.com/w/Void_Relic",
    "https://wiki.warframe.com/w/Void_Relic?redirect=no",
]

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
                return r.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            last_err = e
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


ERA_ORDER = {"Lith": 0, "Meso": 1, "Neo": 2, "Axi": 3, "Requiem": 4}


def parse_relic_name(s: str) -> Tuple[int, str, int, str, str]:
    s = (s or "").strip()
    m = re.match(r"^(\w+)\s+([A-Za-z]+)(\d+)([A-Za-z]*)$", s)
    if not m:
        return (999, s, 0, "", s)
    era = m.group(1)
    letters = m.group(2)
    num = int(m.group(3)) if m.group(3).isdigit() else 0
    tail = m.group(4) or ""
    return (ERA_ORDER.get(era, 99), letters.upper(), num, tail.upper(), s)


def relic_sort_key(name: str):
    return parse_relic_name(name)


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


def extract_unvaulted_available_relics(page_html: str) -> Set[str]:
    t = page_html
    t = re.sub(r"\s+", " ", t)

    idx = t.lower().find("unvaulted/available relics")
    if idx == -1:
        return set()

    window = t[idx: idx + 25000]

    pat = re.compile(r"\b(Lith|Meso|Neo|Axi|Requiem)\s+([A-Za-z]+\d+[A-Za-z]*)\b")
    found = set()
    for era, code in pat.findall(window):
        found.add(f"{era} {code}")
    return found


def fetch_available_set() -> Set[str]:
    last_err = None
    for url in WIKI_URLS:
        try:
            print(f"Fetching Unvaulted/Available relic list from: {url}")
            page = http_text(url)
            s = extract_unvaulted_available_relics(page)
            if s:
                return s
            last_err = RuntimeError("Could not find 'Unvaulted/Available Relics' section.")
        except Exception as e:
            last_err = e
            continue
    raise last_err or RuntimeError("Failed to fetch available relic list from all sources.")


def main():
    ensure_data_dir()

    if not os.path.exists(RELICS_IN):
        raise RuntimeError(f"Missing {RELICS_IN}. Run your Update Relics + Prices workflow first.")

    all_relics = load_relic_names_from_relics_min()
    print(f"Relics loaded: {len(all_relics)}")

    available_set = fetch_available_set()
    print(f"Available relics found in wiki table: {len(available_set)}")

    if len(available_set) < 10:
        raise RuntimeError(
            f"Too few available relics detected ({len(available_set)}). Wiki structure may have changed."
        )

    # Build new mapping
    new_mapping: Dict[str, bool] = {}
    for name in sorted(all_relics, key=relic_sort_key):
        new_mapping[name] = (name in available_set)

    # -------- NEW LOGIC: Only rewrite file if mapping changed --------
    if os.path.exists(VAULT_OUT):
        try:
            with open(VAULT_OUT, "r", encoding="utf-8") as f:
                old_data = json.load(f)
                old_mapping = old_data.get("available", {})

            if old_mapping == new_mapping:
                print("No change in availability mapping. Not rewriting vaultStatus.json.")
                return

        except Exception:
            pass  # If file is corrupt, rewrite it

    out = {
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d"),
        "available": new_mapping,
    }

    with open(VAULT_OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    trues = sum(1 for v in new_mapping.values() if v)
    falses = len(new_mapping) - trues
    print(f"vaultStatus written: {VAULT_OUT} (available=true: {trues}, vaulted=false: {falses})")


if __name__ == "__main__":
    main()
