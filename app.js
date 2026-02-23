// app.js — Modal picker UI + prices from data/prices.json ONLY.
// No caching, no client-side price fetching.

let RELICS = [];
let PRICES = {};
let RELIC_NAMES = [];

const state = { r1: null, r2: null, r3: null, r4: null };

const $ = (id) => document.getElementById(id);
const norm = (s) => (s || "").trim();

function setStatus(msg) {
  const el = $("status");
  if (el) el.textContent = msg || "";
}

function relicDisplayName(r) {
  const era = r.era ?? r.tier ?? "";
  const name = r.name ?? r.relicName ?? r.code ?? "";
  return `${era} ${name}`.trim().replace(/\s+/g, " ");
}

function platForItem(itemName) {
  const v = PRICES[itemName];
  return (typeof v === "number") ? v : null;
}

// Rarity badge format: Rare (2%), Uncommon (11%), Common (25%)
function rarityToLabel(r) {
  const val = Number(r);
  if (isNaN(val)) return "";

  const rounded = Math.round(val * 100) / 100;

  if (rounded <= 2.5) return `Rare (${rounded}%)`;
  if (rounded <= 15) return `Uncommon (${rounded}%)`;
  return `Common (${rounded}%)`;
}

// ---------------- Natural relic sorting ----------------
const ERA_ORDER = { Lith: 0, Meso: 1, Neo: 2, Axi: 3 };

function parseRelicName(str) {
  const s = (str || "").trim().replace(/\s+/g, " ");
  const m = s.match(/^(\w+)\s+([A-Za-z]+)(\d+)([A-Za-z]*)$/);
  if (!m) return { era: "", code: s, letters: s, num: 0, tail: "" };
  return {
    era: m[1],
    code: `${m[2]}${m[3]}${m[4] || ""}`,
    letters: m[2],
    num: parseInt(m[3], 10) || 0,
    tail: m[4] || ""
  };
}

function relicNaturalCompare(a, b) {
  const A = parseRelicName(a);
  const B = parseRelicName(b);

  const eraA = ERA_ORDER[A.era] ?? 99;
  const eraB = ERA_ORDER[B.era] ?? 99;
  if (eraA !== eraB) return eraA - eraB;

  const lc = A.letters.localeCompare(B.letters, undefined, { sensitivity: "base" });
  if (lc !== 0) return lc;

  if (A.num !== B.num) return A.num - B.num;

  const tc = A.tail.localeCompare(B.tail, undefined, { sensitivity: "base" });
  if (tc !== 0) return tc;

  return a.localeCompare(b);
}

// ---------------- Item -> relic index (for Items search mode) ----------------
let ITEM_TO_RELICS = null;

function buildItemIndex() {
  // Map: lowercase item name -> { displayName, entries: [{ relicName, rarityLabel }] }
  const map = new Map();

  for (const r of RELICS) {
    const rname = relicDisplayName(r);
    const drops = r.drops ?? r.rewards ?? [];

    for (const d of drops) {
      const item = (d.item ?? d.name ?? d.reward ?? "").trim();
      if (!item) continue;

      const rarityLabel = rarityToLabel(d.rarity ?? d.chance ?? d.tier ?? "");
      const key = item.toLowerCase();

      if (!map.has(key)) {
        map.set(key, { displayName: item, entries: [] });
      }
      map.get(key).entries.push({ relicName: rname, rarityLabel });
    }
  }

  ITEM_TO_RELICS = map;
}

// ---------------- Modal picker + toggle mode ----------------
let modalTarget = null;
let SEARCH_MODE = "relic"; // default

function setSearchMode(mode) {
  SEARCH_MODE = (mode === "items") ? "items" : "relic";

  const btn = $("modeToggle");
  if (btn) {
    btn.textContent = (SEARCH_MODE === "items") ? "Items" : "Relics";
    btn.dataset.mode = SEARCH_MODE;
    btn.setAttribute("aria-pressed", SEARCH_MODE === "items" ? "true" : "false");
  }

  const search = $("modalSearch");
  if (search) {
    search.placeholder =
      (SEARCH_MODE === "items")
        ? "Search item: e.g. Wisp Prime Chassis Blueprint"
        : "Search: e.g. Meso C1 / Neo N16 / Axi S18";
  }

  renderModalList($("modalSearch")?.value || "");
}

function openModal(targetKey) {
  const modal = $("modal");
  if (!modal) return;

  modalTarget = targetKey;

  const title = $("modalTitle");
  if (title) title.textContent = "Choose relic";

  const search = $("modalSearch");
  if (search) search.value = "";

  // Always open default mode = Relics (as you requested)
  setSearchMode("relic");

  modal.classList.remove("hidden");
  setTimeout(() => search?.focus(), 60);
}

function closeModal() {
  const modal = $("modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modalTarget = null;
}

function renderModalList(filter) {
  const listEl = $("modalList");
  if (!listEl) return;

  const q = (filter || "").toLowerCase().trim();
  listEl.innerHTML = "";

  // ---------- ITEMS MODE ----------
  if (SEARCH_MODE === "items") {
    if (!q) {
      const row = document.createElement("div");
      row.className = "modalItem";
      row.innerHTML = `<strong>Type an item name</strong><span>Example: Wisp Prime Chassis Blueprint</span>`;
      listEl.appendChild(row);
      return;
    }

    if (!ITEM_TO_RELICS) buildItemIndex();

    const matches = [];
    for (const [key, info] of ITEM_TO_RELICS.entries()) {
      if (key.includes(q)) matches.push(info);
      if (matches.length >= 50) break;
    }

    if (matches.length === 0) {
      const row = document.createElement("div");
      row.className = "modalItem";
      row.innerHTML = `<strong>No item match</strong><span>Try shorter (e.g. wisp chassis)</span>`;
      listEl.appendChild(row);
      return;
    }

    // Show top results; each row includes which relics contain it
    for (const info of matches.slice(0, 12)) {
      const relicList = info.entries
        .slice(0, 6)
        .map(e => `${e.relicName}${e.rarityLabel ? ` • ${e.rarityLabel}` : ""}`)
        .join(" | ");

      const row = document.createElement("div");
      row.className = "modalItem";
      row.innerHTML = `<strong>${info.displayName}</strong><span>${relicList}</span>`;

      // Click selects the first relic containing that item (fast UX)
      row.addEventListener("click", () => {
        if (!modalTarget) return;

        const firstRelic = info.entries[0]?.relicName;
        if (!firstRelic) return;

        state[modalTarget] = firstRelic;

        const tEl = $(`${modalTarget}Text`);
        if (tEl) {
          tEl.textContent = firstRelic;
          tEl.classList.remove("pickerPlaceholder");
        }

        closeModal();
      });

      listEl.appendChild(row);
    }

    return;
  }

  // ---------- RELICS MODE (UNCHANGED BEHAVIOR) ----------
  const list = q
    ? RELIC_NAMES.filter(n => n.toLowerCase().includes(q)).slice(0, 800)
    : RELIC_NAMES.slice(0, 800);

  for (const name of list) {
    const row = document.createElement("div");
    row.className = "modalItem";
    row.innerHTML = `<strong>${name}</strong><span>Tap to select</span>`;
    row.addEventListener("click", () => {
      if (!modalTarget) return;

      state[modalTarget] = name;

      const tEl = $(`${modalTarget}Text`);
      if (tEl) {
        tEl.textContent = name;
        tEl.classList.remove("pickerPlaceholder");
      }

      closeModal();
    });
    listEl.appendChild(row);
  }
}

// ---------------- Rewards render ----------------
function mergeAndSortRewards(relicsPicked) {
  const all = [];

  for (const r of relicsPicked) {
    const drops = r.drops ?? r.rewards ?? [];
    for (const d of drops) {
      const item = d.item ?? d.name ?? d.reward ?? "Unknown";
      const rarity = rarityToLabel(d.rarity ?? d.chance ?? d.tier ?? "");
      const plat = platForItem(item);
      all.push({
        item,
        from: relicDisplayName(r),
        rarity,
        plat: plat ?? -1
      });
    }
  }

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

function renderCards(list) {
  const cardsEl = $("cards");
  if (!cardsEl) return;

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
}

function showRewards() {
  const picks = [state.r1, state.r2, state.r3, state.r4].filter(Boolean);

  if (picks.length === 0) {
    setStatus("Pick at least 1 relic");
    return;
  }

  const relicsPicked = picks
    .map(name => RELICS.find(r => relicDisplayName(r) === name))
    .filter(Boolean);

  if (relicsPicked.length === 0) {
    setStatus("Could not match relic names (try selecting again).");
    return;
  }

  const rewards = mergeAndSortRewards(relicsPicked);
  renderCards(rewards);

  const priced = rewards.filter(r => r.plat >= 0).length;
  setStatus(`Showing ${rewards.length} unique rewards • priced: ${priced}`);
}

// ---------------- Boot ----------------
async function boot() {
  setStatus("Loading…");

  const relicRes = await fetch("./data/Relics.min.json", { cache: "no-store" });
  RELICS = await relicRes.json();

  try {
    const priceRes = await fetch("./data/prices.json", { cache: "no-store" });
    PRICES = await priceRes.json();
  } catch {
    PRICES = {};
  }

  RELIC_NAMES = RELICS.map(relicDisplayName).sort(relicNaturalCompare);

  // Build item index once (only used when toggled to Items)
  buildItemIndex();

  const footer = $("footer");
  if (footer) footer.textContent = `Relics: ${RELICS.length} • Price entries: ${Object.keys(PRICES).length}`;

  $("modalClose")?.addEventListener("click", closeModal);
  $("modalSearch")?.addEventListener("input", (e) => renderModalList(e.target.value));

  // NEW: toggle Relics/Items
  $("modeToggle")?.addEventListener("click", () => {
    setSearchMode(SEARCH_MODE === "relic" ? "items" : "relic");
  });

  document.querySelectorAll(".pickerBtn").forEach(btn => {
    btn.addEventListener("click", () => openModal(btn.dataset.target));
  });

  $("btnShow")?.addEventListener("click", showRewards);
  $("btnClear")?.addEventListener("click", () => {
    state.r1 = state.r2 = state.r3 = state.r4 = null;

    ["r1Text", "r2Text", "r3Text", "r4Text"].forEach(id => {
      const el = $(id);
      if (el) {
        el.textContent = "Tap to choose (Lith/Meso/Neo/Axi)";
        el.classList.add("pickerPlaceholder");
      }
    });

    $("cards") && ($("cards").innerHTML = "");
    setStatus("Cleared");
  });

  setStatus("Ready");
}

document.addEventListener("DOMContentLoaded", () => {
  boot().catch(err => {
    console.error(err);
    setStatus("Failed to load data");
  });
});
