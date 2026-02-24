#!/usr/bin/env python3
# Generates data/vaultStatus.json by parsing the Warframe Wiki "Unvaulted/Available Relics" table.
# Uses MediaWiki API (less likely to 403 on GitHub Actions).
# IMPORTANT: Only rewrites the JSON if the availability mapping changes (prevents workflow chaining every run).

import json
import re
import sys
import datetime
from pathlib import Path
import urllib.request
import urllib.parse

DATA_DIR = Path("data")
RELICS_FILE = DATA_DIR / "Relics.min.json"
OUT_FILE = DATA_DIR / "vaultStatus.json"

WIKI_PAGE = "Void_Relic"
WIKI_BASE = "https://wiki.warframe.com"
WIKI_URL = f"{WIKI_BASE}/w/{WIKI_PAGE}"
WIKI_API = f"{WIKI_BASE}/api.php"

ERA_ORDER = {"Lith": 0, "Meso": 1, "Neo": 2, "Axi": 3, "Requiem": 4}

def http_text(url: str, timeout: int = 25) -> str:
    req = urllib.request.Request(
        url,
        headers={
            # Use a realistic UA and headers; still might be blocked for direct HTML.
            "User-Agent": "Mozilla/5.0 (compatible; Warframe-RelicBot/1.0; +https://github.com/)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": WIKI_BASE + "/",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")

def fetch_via_mediawiki_api(timeout: int = 25) -> str:
    """
    Fetch parsed HTML via MediaWiki API:
    api.php?action=parse&page=Void_Relic&prop=text&format=json
    """
    params = {
        "action": "parse",
        "page": WIKI_PAGE,
        "prop": "text",
        "format": "json",
        "formatversion": "2",
    }
    url = WIKI_API + "?" + urllib.parse.urlencode(params)

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; Warframe-RelicBot/1.0; +https://github.com/)",
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": WIKI_BASE + "/",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = json.loads(r.read().decode("utf-8", errors="replace"))

    # MediaWiki parse output: { "parse": { "text": "<div>...</div>" } }
    html = ""
    if isinstance(data, dict) and "parse" in data and isinstance(data["parse"], dict):
        html = data["parse"].get("text", "") or ""
    if not html:
        raise RuntimeError("MediaWiki API returned empty parse.text")
    return html

def relic_display_name(obj: dict) -> str:
    era = obj.get("era") or obj.get("tier") or ""
    name = obj.get("name") or obj.get("relicName") or obj.get("code") or ""
    return f"{era} {name}".strip()

def parse_relic_name(s: str):
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
    Extract ONLY from the 'Unvaulted/Available Relics' section.
    We slice from the heading down to avoid capturing unrelated relic mentions.
    """
    marker = "Unvaulted/Available Relics"
    i = html.find(marker)
    if i == -1:
        return set()

    end_markers = ["Raw Data", "Raw data", "Vaulted Relics", "vaulted relics"]
    end_idx = -1
    for em in end_markers:
        j = html.find(em, i)
        if j != -1:
            end_idx = j
            break

    chunk = html[i:end_idx] if end_idx != -1 else html[i:i + 250000]

    available = set()

    # Standard eras
    for era, code in re.findall(r"\b(Lith|Meso|Neo|Axi)\s+([A-Za-z]+\d+[A-Za-z]*)\b", chunk):
        available.add(f"{era} {code}")

    # Requiem (I, II, III, IV, Eterna)
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

    # Prefer MediaWiki API (avoids 403 on Actions)
    try:
        html = fetch_via_mediawiki_api()
        print("Fetched via MediaWiki API ✅")
    except Exception as e:
        print(f"MediaWiki API fetch failed ({e}). Falling back to direct HTML…")
        html = http_text(WIKI_URL)

    available_set = extract_available_from_wiki(html)
    if not available_set:
        print("WARNING: Could not extract available relics from wiki section.", file=sys.stderr)

    mapping = {name: (name in available_set) for name in relic_names}

    sorted_names = sorted(mapping.keys(), key=relic_natural_sort_key)
    ordered_mapping = {k: mapping[k] for k in sorted_names}

    old_available = load_existing_available()
    if old_available is not None:
        # Compare only the mapping, ignore generated_at
        same = True

        if set(old_available.keys()) != set(ordered_mapping.keys()):
            same = False
        else:
            for k, v in ordered_mapping.items():
                if old_available.get(k) != v:
                    same = False
                    break

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
