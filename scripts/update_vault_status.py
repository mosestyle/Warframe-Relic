#!/usr/bin/env python3
# Generates data/vaultStatus.json by parsing the Warframe Wiki "Unvaulted/Available Relics" table.
# IMPORTANT: Will ONLY rewrite/commit the JSON if the actual availability mapping changes.
# This prevents triggering downstream heavy workflows every time (because of generated_at).

import json
import re
import sys
import datetime
from pathlib import Path
import urllib.request

DATA_DIR = Path("data")
RELICS_FILE = DATA_DIR / "Relics.min.json"
OUT_FILE = DATA_DIR / "vaultStatus.json"

WIKI_URL = "https://wiki.warframe.com/w/Void_Relic"

ERA_ORDER = {"Lith": 0, "Meso": 1, "Neo": 2, "Axi": 3, "Requiem": 4}

def http_text(url: str, timeout: int = 25) -> str:
    req = urllib.request.Request(
        url,
        headers={
            # Avoid 403 / bot blocking
            "User-Agent": "Mozilla/5.0 (compatible; Warframe-RelicBot/1.0; +https://github.com/)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")

def relic_display_name(obj: dict) -> str:
    era = obj.get("era") or obj.get("tier") or ""
    name = obj.get("name") or obj.get("relicName") or obj.get("code") or ""
    return f"{era} {name}".strip()

def parse_relic_name(s: str):
    # Matches: "Lith K12", "Meso W1", "Neo N16", etc.
    # Also allows tails like "A3B"
    s = " ".join((s or "").split())
    m = re.match(r"^(\w+)\s+([A-Za-z]+)(\d+)([A-Za-z]*)$", s)
    if not m:
        return {"era": "", "letters": s, "num": 0, "tail": "", "raw": s}

    era, letters, num, tail = m.group(1), m.group(2), m.group(3), m.group(4) or ""
    return {
        "era": era,
        "letters": letters,
        "num": int(num) if num.isdigit() else 0,
        "tail": tail,
        "raw": s,
    }

def relic_natural_sort_key(name: str):
    p = parse_relic_name(name)
    era = ERA_ORDER.get(p["era"], 99)
    return (era, p["letters"].lower(), p["num"], p["tail"].lower(), p["raw"].lower())

def extract_available_from_wiki(html: str) -> set[str]:
    """
    Extract ONLY from the 'Unvaulted/Available Relics' table section.

    We slice the HTML from the heading occurrence to a safe endpoint
    to avoid accidentally capturing other relic mentions elsewhere.
    """
    marker = "Unvaulted/Available Relics"
    i = html.find(marker)
    if i == -1:
        return set()

    # Try to stop at "Raw Data" section or another common boundary
    end_markers = ["Raw Data", "Raw data", "Vaulted Relics", "vaulted relics"]
    end_idx = -1
    for em in end_markers:
        j = html.find(em, i)
        if j != -1:
            end_idx = j
            break

    chunk = html[i:end_idx] if end_idx != -1 else html[i:i + 250000]

    # Capture: Lith K12, Meso A9, Neo C7, Axi S18, Requiem I, etc.
    # Requiem are roman numerals / words, so handle separately.
    available = set()

    # Standard eras (Lith/Meso/Neo/Axi)
    for era, code in re.findall(r"\b(Lith|Meso|Neo|Axi)\s+([A-Za-z]+\d+[A-Za-z]*)\b", chunk):
        available.add(f"{era} {code}")

    # Requiem list often contains "Requiem I", "Requiem II", etc.
    for code in re.findall(r"\bRequiem\s+([IVX]+|Eterna)\b", chunk):
        available.add(f"Requiem {code}")

    return available

def load_existing_available() -> dict | None:
    if not OUT_FILE.exists():
        return None
    try:
        old = json.loads(OUT_FILE.read_text(encoding="utf-8"))
        if isinstance(old, dict) and isinstance(old.get("available"), dict):
            return old["available"]
    except Exception:
        return None
    return None

def main():
    if not RELICS_FILE.exists():
        print(f"Missing {RELICS_FILE}. Run the WFCD update first.", file=sys.stderr)
        sys.exit(1)

    relics = json.loads(RELICS_FILE.read_text(encoding="utf-8"))
    relic_names = [relic_display_name(r) for r in relics if relic_display_name(r)]

    print(f"Relics loaded: {len(relic_names)}")
    print(f"Fetching Unvaulted/Available relic list from: {WIKI_URL}")

    html = http_text(WIKI_URL)
    available_set = extract_available_from_wiki(html)

    if not available_set:
        print("WARNING: Could not extract available relics from wiki section.", file=sys.stderr)

    # Build mapping for ALL relics in your dataset:
    # True = available/unvaulted (in wiki table)
    # False = vaulted/unavailable (not in wiki table)
    mapping = {name: (name in available_set) for name in relic_names}

    # Sort keys in natural order (same style as your relic list)
    sorted_names = sorted(mapping.keys(), key=relic_natural_sort_key)
    ordered_mapping = {k: mapping[k] for k in sorted_names}

    # Compare with existing file (ONLY compare the mapping, NOT generated_at)
    old_available = load_existing_available()
    if old_available is not None:
        # If the old file contains extra keys, compare only current ones
        same = True
        for k, v in ordered_mapping.items():
            if old_available.get(k) != v:
                same = False
                break
        # Also ensure no missing keys previously that would change meaning
        if same:
            # If old had keys we no longer have, that’s a change (rare)
            old_keys = set(old_available.keys())
            new_keys = set(ordered_mapping.keys())
            if old_keys != new_keys:
                same = False

        if same:
            print("No change in availability mapping. Not rewriting vaultStatus.json.")
            return

    out = {
        "generated_at": datetime.date.today().isoformat(),
        "available": ordered_mapping,
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_FILE} (changed mapping)")

if __name__ == "__main__":
    main()
