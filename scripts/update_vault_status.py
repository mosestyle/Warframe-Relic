#!/usr/bin/env python3
import json
import os
import re
import urllib.request
from typing import Any, Dict, Set


WIKI_URL = "https://wiki.warframe.com/w/Void_Relic"

DATA_DIR = "data"
RELICS_MIN_PATH = os.path.join(DATA_DIR, "Relics.min.json")
VAULT_STATUS_OUT = os.path.join(DATA_DIR, "vaultStatus.json")
ACTIVE_RELICS_OUT = os.path.join(DATA_DIR, "activeRelics.json")


def http_get(url: str, timeout: int = 40) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "mosestyle-warframe-relic/1.0 (+github actions)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    return raw.decode("utf-8", errors="replace")


def extract_available_relics_from_wiki(html: str) -> Set[str]:
    """
    Extract relic names from the Wiki 'Void Relic' page.

    We focus on the 'Unvaulted/Available Relics' table section by taking a large chunk
    after that heading. Then we regex-match relic names like:
      Lith K12, Meso C1, Neo N16, Axi A20

    Returns a set of full names e.g. "Lith K12".
    """
    # Try to locate the "Unvaulted/Available Relics" area; if it moves, still works.
    m = re.search(r"Unvaulted\s*/\s*Available\s*Relics", html, flags=re.IGNORECASE)
    chunk = html[m.start():m.start() + 150000] if m else html

    relic_re = re.compile(r"\b(Lith|Meso|Neo|Axi)\s+([A-Za-z]+)(\d+)([A-Za-z]*)\b")
    out = set()
    for era, letters, num, tail in relic_re.findall(chunk):
        out.add(f"{era} {letters}{num}{tail}".strip())
    return out


def relic_display_name(r: Dict[str, Any]) -> str:
    # Your Relics.min.json objects look like: {"tier":"Lith","name":"K12",...}
    tier = (r.get("tier") or r.get("era") or "").strip()
    name = (r.get("name") or r.get("relicName") or r.get("code") or "").strip()
    return f"{tier} {name}".strip()


def main() -> None:
    if not os.path.exists(RELICS_MIN_PATH):
        raise RuntimeError(
            f"Missing {RELICS_MIN_PATH}. Run your WFCD relic build workflow first."
        )

    print(f"Fetching wiki: {WIKI_URL}")
    html = http_get(WIKI_URL)
    available = extract_available_relics_from_wiki(html)
    print(f"Available relics found on wiki: {len(available)}")

    with open(RELICS_MIN_PATH, "r", encoding="utf-8") as f:
        relics = json.load(f)

    # Map every relic you have -> available True/False
    vault_status: Dict[str, bool] = {}
    for r in relics:
        name = relic_display_name(r)
        if not name:
            continue
        vault_status[name] = (name in available)

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(VAULT_STATUS_OUT, "w", encoding="utf-8") as f:
        json.dump(vault_status, f, ensure_ascii=False, separators=(",", ":"))
    with open(ACTIVE_RELICS_OUT, "w", encoding="utf-8") as f:
        json.dump(sorted(available), f, ensure_ascii=False, indent=2)

    print(f"Wrote {VAULT_STATUS_OUT} with {len(vault_status)} entries")
    print(f"Wrote {ACTIVE_RELICS_OUT} with {len(available)} relics")


if __name__ == "__main__":
    main()
