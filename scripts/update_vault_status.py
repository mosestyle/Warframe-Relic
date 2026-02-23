import json
import re
import sys
from datetime import datetime, timezone
from urllib.request import Request, urlopen

WIKI_URL = "https://wiki.warframe.com/w/Void_Relic"

# We only need the "Unvaulted/Available Relics" section text.
# We'll parse relic tokens like "Lith K12", "Meso A9", "Neo C7", "Axi S18".
RELIC_RE = re.compile(r"\b(Lith|Meso|Neo|Axi)\s+([A-Z]\d{1,2})\b")

def fetch_html(url: str) -> str:
    req = Request(
        url,
        headers={
            "User-Agent": "mosestyle-warframe-relic/1.0 (+https://mosestyle.github.io/Warframe-Relic/)"
        }
    )
    with urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")

def extract_available_relics(html: str) -> set[str]:
    # Heuristic: find the "Unvaulted/Available Relics" heading area.
    # The page HTML changes sometimes, so we:
    # 1) narrow to a chunk around the phrase
    # 2) regex relic tokens inside that chunk
    needle = "Unvaulted/Available Relics"
    idx = html.find(needle)
    if idx == -1:
        # fallback: parse whole page
        chunk = html
    else:
        # take a big window after the heading
        chunk = html[idx: idx + 200000]

    found = set()
    for era, code in RELIC_RE.findall(chunk):
        found.add(f"{era} {code}")

    return found

def main():
    try:
        html = fetch_html(WIKI_URL)
    except Exception as e:
        print(f"ERROR: failed to fetch wiki: {e}", file=sys.stderr)
        sys.exit(1)

    available = extract_available_relics(html)

    if len(available) < 10:
        # Safety check: if parsing fails, don't overwrite with nonsense.
        print(
            f"ERROR: parsed too few available relics ({len(available)}). "
            f"Wiki layout may have changed.",
            file=sys.stderr
        )
        sys.exit(1)

    # Output format: {"Lith K12": true, "Meso A9": true, ...}
    out = {name: True for name in sorted(available)}

    # Also include a tiny meta field for debugging if you want later
    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "available": out
    }

    # Write to data/vaultStatus.json
    # IMPORTANT: The site code can support either:
    # - dict direct, or {available:{...}}
    # We'll write {available:{...}} + generated_at
    with open("data/vaultStatus.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"vaultStatus.json written: {len(out)} available relics")

if __name__ == "__main__":
    main()
