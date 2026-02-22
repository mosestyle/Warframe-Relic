// Universal app.js (works with your current UI) + client-side Platinum fetching + caching

let RELICS = [];
let PRICES = {};              // Loaded from ./data/prices.json if present
let RELIC_NAMES = [];
const state = { r1: null, r2: null, r3: null, r4: null };

// In-memory cache for this session
const priceCache = new Map();

// Persisted cache key (phone browser)
const PRICE_CACHE_KEY = "wf_relic_price_cache_v1";

function $(id) { return document.getElementById(id); }
function norm(s) { return (s || "").trim(); }

function setStatus(msg) {
  const el = $("status");
  if (el) el.textContent = msg || "";
}

function relicDisplayName(relicObj) {
  const era = relicObj.era ?? relicObj.tier ?? "";
  const name = relicObj.name ?? relicObj.relicName ?? relicObj.code ?? "";
  return `${era} ${name}`.trim().replace(/\s+/g, " ");
}

function rarityToLabel(r) {
  // Your relic JSON may include probabilities (0.02 etc) or rarity strings.
  if (typeof r === "number") return String(r); // keep chance as-is (your UI shows 0.25 etc)
  const s = String(r ?? "").toLowerCase();
  if (s.includes("rare")) return "Rare";
  if (s.includes("uncommon")) return "Uncommon";
  if (s.includes("common")) return "Common";
  return String(r ?? "");
}

function platForItem(itemName) {
  // 1) session cache
  if (priceCache.has(itemName)) return priceCache.get(itemName);

  // 2) prices.json preloaded
  const v = PRICES[itemName];
  if (typeof v === "number") {
    priceCache.set(itemName, v);
    return v;
  }

  // 3) localStorage cache
  const stored = loadPriceCacheFromStorage();
  if (stored && typeof stored[itemName] === "number") {
    priceCache.set(itemName, stored[itemName]);
    return stored[itemName];
  }

  return null;
}

// ---------- Price fetching (client-side) ----------

function toUrlName(itemName) {
  // Best-effort warframe.market url_name
  // Example: "Hydroid Prime Neuroptics Blueprint" -> "hydroid_prime_neuroptics_blueprint"
  let s = itemName.trim().toLowerCase();
  s = s.replace(/’/g, "'").replace(/&/g, "and");
  s = s.replace(/['"]/g, " ");       // remove quotes/apostrophes
  s = s.replace(/-/g, " ");
  s = s.replace(/[^a-z0-9 _]/g, " "); // keep only letters/numbers/spaces/underscore
  s = s.replace(/\s+/g, "_");
  s = s.replace(/_+/g, "_");
  s = s.replace(/^_+|_+$/g, "");
  return s;
}

async function fetchLowestSellPlat(itemName) {
  // If already cached, return immediately
  const cached = platForItem(itemName);
  if (typeof cached === "number") return cached;

  const urlName = toUrlName(itemName);
  const url = `https://api.warframe.market/v1/items/${urlName}/orders`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Platform": "pc",
        "Language": "en"
      }
    });

    if (!res.ok) return null; // 404 etc -> null

    const js = await res.json();
    const orders = js?.payload?.orders ?? [];

    // lowest sell from visible pc orders where user is online/ingame
    const sells = [];
    for (const o of orders) {
      if (!o?.visible) continue;
      if (o?.platform !== "pc") continue;
      if (o?.order_type !== "sell") continue;
      const user = o?.user ?? {};
      if (!["online", "ingame"].includes(user.status)) continue;
      const p = o?.platinum;
      if (typeof p === "number") sells.push(p);
    }

    if (!sells.length) return null;

    const price = Math.min(...sells);
    return Math.round(price);
  } catch {
    return null;
  }
}

function loadPriceCacheFromStorage() {
  try {
    const raw = localStorage.getItem(PRICE_CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") return obj;
    return null;
  } catch {
    return null;
  }
}

function savePriceToStorage(itemName, plat) {
  try {
    const obj = loadPriceCacheFromStorage() || {};
    obj[itemName] = plat;
    localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify(obj));
  } catch {
    // ignore
  }
}

async function fetchPricesForRewards(rewardList, maxToFetch = 40) {
  // Fetch prices only for items that are missing
  const missing = rewardList
    .filter(r => !(typeof r.plat === "number" && r.plat >= 0))
    .map(r => r.item);

  const uniqueMissing = [...new Set(missing)].slice(0, maxToFetch);
  if (!uniqueMissing.length) return 0;

  setStatus(`Fetching prices… (${uniqueMissing.length})`);

  // Limit concurrency so we don't spam the API
  const CONCURRENCY = 6;
  let idx = 0;
  let updated = 0;

  async function worker() {
    while (idx < uniqueMissing.length) {
      const myIndex = idx++;
      const itemName = uniqueMissing[myIndex];

      const p = await fetchLowestSellPlat(itemName);
      if (typeof p === "number") {
        priceCache.set(itemName, p);
        savePriceToStorage(itemName, p);
        updated++;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return updated;
}

// ---------- Selection + reward merging ----------

function pickSelectedRelicNames() {
  const picks = [];

  // Modal UI text spans (if present)
  ["r1Text", "r2Text", "r3Text", "r4Text"].forEach(id => {
    const el = $(id);
    if (el) {
      const t = norm(el.textContent);
      if (t && !t.toLowerCase().includes("tap to choose")) picks.push(t);
    }
  });

  // Old inputs (if present)
  ["r1", "r2", "r3", "r4"].forEach(id => {
    const el = $(id);
    if (el && "value" in el) {
      const t = norm(el.value);
      if (t) picks.push(t);
    }
  });

  // State fallback
  ["r1", "r2", "r3", "r4"].forEach(k => {
    if (state[k]) picks.push(state[k]);
  });

  return [...new Set(picks)];
}

function findRelicsByNames(names) {
  // Exact match
  const exact = names
    .map(n => RELICS.find(r => relicDisplayName(r) === n))
    .filter(Boolean);

  if (exact.length) return exact;

  // Case-insensitive fallback
  const map = new Map(RELICS.map(r => [relicDisplayName(r).toLowerCase(), r]));
  return names.map(n => map.get(n.toLowerCase())).filter(Boolean);
}

function mergeAndSortRewards(relicsPicked) {
  const all = [];
  for (const r of relicsPicked) {
    const drops = r.drops ?? r.rewards ?? [];
    for (const d of drops) {
      const item = d.item ?? d.name ?? d.reward ?? "Unknown";
      const rarity = rarityToLabel(d.rarity ?? d.chance ?? d.tier ?? "");
      const plat = platForItem(item);
      all.push({ item, from: relicDisplayName(r), rarity, plat: plat ?? -1 });
    }
  }

  // Merge duplicates by item
  const merged = new Map();
  for (const e of all) {
    const prev = merged.get(e.item);
    if (!prev) {
      merged.set(e.item, { ...e, fromSet: new Set([e.from]) });
    } else {
      prev.fromSet.add(e.from);
      prev.plat = Math.max(prev.plat, e.plat);
    }
  }

  const final = [...merged.values()].map(x => ({
    item: x.item,
    from: [...x.fromSet].join(", "),
    rarity: x.rarity,
    plat: x.plat
  }));

  final.sort((a, b) => b.plat - a.plat);
  return final;
}

// ---------- Rendering ----------

function renderCards(list) {
  const cardsEl = $("cards");
  if (!cardsEl) return false;

  cardsEl.innerHTML = "";
  for (const e of list) {
    const div = document.createElement("div");
    div.className = "cardRow";
    div.innerHTML = `
      <div class="cardLeft">
        <div class="itemName">${e.item}</div>
        <div class="itemMeta">
          <span class="badge">${e.rarity || ""}</span>
          <span>${e.from}</span>
        </div>
      </div>
      <div class="cardRight">
        <div class="platNum">${e.plat >= 0 ? e.plat : "?"}</div>
        <div class="platLbl">Plat</div>
      </div>
    `;
    cardsEl.appendChild(div);
  }
  return true;
}

function renderTable(list) {
  const rowsEl = $("rows");
  if (!rowsEl) return false;

  rowsEl.innerHTML = "";
  for (const e of list) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${e.item}</td>
      <td class="muted">${e.from}</td>
      <td class="muted">${e.rarity || ""}</td>
      <td class="num">${e.plat >= 0 ? e.plat : "?"}</td>
    `;
    rowsEl.appendChild(tr);
  }
  return true;
}

// ---------- Main action ----------

async function showRewardsForSelectedRelics() {
  const picks = pickSelectedRelicNames();
  if (!picks.length) {
    setStatus("Pick at least 1 relic");
    return;
  }

  const relicsPicked = findRelicsByNames(picks);
  if (!relicsPicked.length) {
    setStatus("Could not match relic names. Re-select the relics.");
    return;
  }

  // 1) render immediately (even if prices missing)
  let rewards = mergeAndSortRewards(relicsPicked);
  (renderCards(rewards) || renderTable(rewards));
  setStatus(`Showing ${rewards.length} unique rewards`);

  // 2) fetch missing prices (phone-side), then re-render with prices
  const updated = await fetchPricesForRewards(rewards, 50);

  // Recompute plat values from cache and re-sort
  rewards = rewards.map(r => {
    const p = platForItem(r.item);
    return { ...r, plat: (typeof p === "number") ? p : -1 };
  });
  rewards.sort((a, b) => b.plat - a.plat);

  (renderCards(rewards) || renderTable(rewards));

  if (updated > 0) {
    setStatus(`Updated prices for ${updated} items`);
  } else {
    setStatus("No prices fetched (some items may not match market names)");
  }

  // Update footer “Price entries” based on local cache size (more truthful for you)
  const stored = loadPriceCacheFromStorage() || {};
  const footer = $("footer");
  if (footer) footer.textContent = `Relics: ${RELICS.length} • Cached prices: ${Object.keys(stored).length}`;
}

// ---------- Boot ----------

async function boot() {
  setStatus("Loading data…");

  const [relicRes, priceRes] = await Promise.all([
    fetch("./data/Relics.min.json", { cache: "no-store" }),
    fetch("./data/prices.json", { cache: "no-store" }).catch(() => null)
  ]);

  RELICS = await relicRes.json();
  try {
    PRICES = priceRes ? await priceRes.json() : {};
  } catch {
    PRICES = {};
  }

  RELIC_NAMES = RELICS.map(relicDisplayName).sort((a, b) => a.localeCompare(b));

  const footer = $("footer");
  if (footer) {
    const stored = loadPriceCacheFromStorage() || {};
    footer.textContent = `Relics: ${RELICS.length} • Cached prices: ${Object.keys(stored).length}`;
  }

  setStatus("Ready");
}

document.addEventListener("DOMContentLoaded", () => {
  const showBtn = $("btnShow");
  const clearBtn = $("btnClear");

  if (showBtn) showBtn.addEventListener("click", () => { showRewardsForSelectedRelics(); });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      ["r1", "r2", "r3", "r4"].forEach(id => {
        const el = $(id);
        if (el && "value" in el) el.value = "";
      });

      ["r1", "r2", "r3", "r4"].forEach(k => {
        state[k] = null;
        const tEl = $(`${k}Text`);
        if (tEl) {
          tEl.textContent = "Tap to choose";
          tEl.classList.add("pickerPlaceholder");
        }
      });

      const cards = $("cards");
      if (cards) cards.innerHTML = "";
      const rows = $("rows");
      if (rows) rows.innerHTML = "";

      setStatus("Cleared");
    });
  }

  boot().catch(err => {
    console.error(err);
    setStatus("Failed to load data");
  });
});
