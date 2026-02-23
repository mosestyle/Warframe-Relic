// app.js — Modal picker UI + prices from data/prices.json ONLY.
// No caching, no client-side price fetching.

let RELICS = [];
let PRICES = {};
let RELIC_NAMES = [];

const state = { r1: null, r2: null, r3: null, r4: null };

const $ = (id) => document.getElementById(id);
const norm = (s) => (s || "").trim();

const PICKER_DEFAULT = "Tap to choose (Lith/Meso/Neo/Axi)";

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

  // Sort each item's relic list nicely (natural)
  for (const info of map.values()) {
    info.entries.sort((a, b) => relicNaturalCompare(a.relicName, b.relicName));
  }

  ITEM_TO_RELICS = map;
}

// ---------------- Modal picker + toggle mode ----------------
let modalTarget = null;
let SEARCH_MODE = "relic"; // default

// Items mode drilldown (choose item -> choose relic)
let ITEMS_VIEW = "items_list"; // "items_list" | "relic_pick"
let CURRENT_ITEM_INFO = null;

// NEW: remember the item search text so we can restore it on Back
let ITEM_SEARCH_TEXT = "";

function setSearchMode(mode) {
  SEARCH_MODE = (mode === "items") ? "items" : "relic";

  const btn = $("modeToggle");
  if (btn) {
    btn.textContent = (SEARCH_MODE === "items") ? "Items" : "Relics";
    btn.dataset.mode = SEARCH_MODE;
    btn.setAttribute("aria-pressed", SEARCH_MODE === "items" ? "true" : "false");
  }

  // Reset items drilldown whenever mode changes
  ITEMS_VIEW = "items_list";
  CURRENT_ITEM_INFO = null;

  const search = $("modalSearch");
  if (search) {
    search.placeholder =
      (SEARCH_MODE === "items")
        ? "Search item: e.g. Wisp Prime Neuroptics Blueprint"
        : "Search: e.g. Meso C1 / Neo N16 / Axi S18";
  }

  const title = $("modalTitle");
  if (title) title.textContent = "Choose relic";

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

  // Always open default mode = Relics
  setSearchMode("relic");

  modal.classList.remove("hidden");
  setTimeout(() => search?.focus(), 60);
}

function closeModal() {
  const modal = $("modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modalTarget = null;

  // Reset drilldown when closing
  ITEMS_VIEW = "items_list";
  CURRENT_ITEM_INFO = null;
  ITEM_SEARCH_TEXT = "";
}

function pickRelicIntoTarget(relicName) {
  if (!modalTarget) return;

  state[modalTarget] = relicName;

  const tEl = $(`${modalTarget}Text`);
  if (tEl) {
    tEl.textContent = relicName;
    tEl.classList.remove("pickerPlaceholder");
  }

  closeModal();
}

function renderModalList(filter) {
  const listEl = $("modalList");
  if (!listEl) return;

  const q = (filter || "").toLowerCase().trim();
  listEl.innerHTML = "";

  // ---------- ITEMS MODE ----------
  if (SEARCH_MODE === "items") {
    if (!ITEM_TO_RELICS) buildItemIndex();

    // VIEW 2: choose relic for selected item
    if (ITEMS_VIEW === "relic_pick" && CURRENT_ITEM_INFO) {
      const title = $("modalTitle");
      if (title) title.textContent = "Choose relic";

      // Back row (restores item search text)
      const back = document.createElement("div");
      back.className = "modalItem";
      back.innerHTML = `<strong>← Back</strong><span>Back to item results</span>`;
      back.addEventListener("click", () => {
        ITEMS_VIEW = "items_list";
        CURRENT_ITEM_INFO = null;

        const search = $("modalSearch");
        if (search) {
          search.value = ITEM_SEARCH_TEXT;
          search.placeholder = "Search item: e.g. Wisp Prime Neuroptics Blueprint";
        }

        const t = $("modalTitle");
        if (t) t.textContent = "Choose relic";

        renderModalList(search?.value || "");
      });
      listEl.appendChild(back);

      // Item header row (with price on right)
      const itemPlat = platForItem(CURRENT_ITEM_INFO.displayName);
      const hdr = document.createElement("div");
      hdr.className = "modalItem";
      hdr.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
          <div style="min-width:0">
            <strong>${CURRENT_ITEM_INFO.displayName}</strong>
            <span style="display:block;margin-top:3px">Select which relic to pick</span>
          </div>
          <div style="white-space:nowrap;text-align:right">
            <strong>${itemPlat ?? "?"}</strong>
            <span style="display:block;margin-top:3px">Plat</span>
          </div>
        </div>
      `;
      listEl.appendChild(hdr);

      // Filter relic options by q (now q is a relic filter, not the item name)
      const entries = CURRENT_ITEM_INFO.entries || [];
      const shown = q
        ? entries.filter(e => (e.relicName || "").toLowerCase().includes(q))
        : entries;

      if (shown.length === 0) {
        const none = document.createElement("div");
        none.className = "modalItem";
        none.innerHTML = `<strong>No relic match</strong><span>Try clearing the search</span>`;
        listEl.appendChild(none);
        return;
      }

      for (const e of shown.slice(0, 800)) {
        const row = document.createElement("div");
        row.className = "modalItem";
        row.innerHTML = `<strong>${e.relicName}</strong><span>${e.rarityLabel || "Tap to select"}</span>`;
        row.addEventListener("click", () => pickRelicIntoTarget(e.relicName));
        listEl.appendChild(row);
      }

      return;
    }

    // VIEW 1: item list search
    if (!q) {
      const row = document.createElement("div");
      row.className = "modalItem";
      row.innerHTML = `<strong>Type an item name</strong><span>Example: Wisp Prime Neuroptics Blueprint</span>`;
      listEl.appendChild(row);
      return;
    }

    // Find matching items (limit for performance)
    const matches = [];
    for (const [key, info] of ITEM_TO_RELICS.entries()) {
      if (key.includes(q)) matches.push(info);
      if (matches.length >= 50) break;
    }

    if (matches.length === 0) {
      const row = document.createElement("div");
      row.className = "modalItem";
      row.innerHTML = `<strong>No item match</strong><span>Try shorter (e.g. wisp neuroptics)</span>`;
      listEl.appendChild(row);
      return;
    }

    // Show item results; show plat on the right; tapping item opens relic-pick list
    for (const info of matches.slice(0, 20)) {
      const itemPlat = platForItem(info.displayName);
      const preview = info.entries
        .slice(0, 5)
        .map(e => e.relicName)
        .join(" • ");

      const row = document.createElement("div");
      row.className = "modalItem";
      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
          <div style="min-width:0">
            <strong>${info.displayName}</strong>
            <span style="display:block;margin-top:3px">${preview}${info.entries.length > 5 ? " …" : ""}</span>
          </div>
          <div style="white-space:nowrap;text-align:right">
            <strong>${itemPlat ?? "?"}</strong>
            <span style="display:block;margin-top:3px">Plat</span>
          </div>
        </div>
      `;

      row.addEventListener("click", () => {
        // Save item search text so Back restores it
        const search = $("modalSearch");
        ITEM_SEARCH_TEXT = search?.value || "";

        CURRENT_ITEM_INFO = info;
        ITEMS_VIEW = "relic_pick";

        // CRITICAL FIX:
        // Clear the search text so it does NOT filter relic names by the item name.
        if (search) {
          search.value = "";
          search.placeholder = "Filter relics (optional): e.g. Lith A7 / Meso K6";
        }

        renderModalList("");
      });

      listEl.appendChild(row);
    }

    return;
  }

  // ---------- RELICS MODE ----------
  const list = q
    ? RELIC_NAMES.filter(n => n.toLowerCase().includes(q)).slice(0, 800)
    : RELIC_NAMES.slice(0, 800);

  for (const name of list) {
    const row = document.createElement("div");
    row.className = "modalItem";
    row.innerHTML = `<strong>${name}</strong><span>Tap to select</span>`;
    row.addEventListener("click", () => pickRelicIntoTarget(name));
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

  buildItemIndex();

  const footer = $("footer");
  if (footer) footer.textContent = `Relics: ${RELICS.length} • Price entries: ${Object.keys(PRICES).length}`;

  $("modalClose")?.addEventListener("click", closeModal);

  $("modalSearch")?.addEventListener("input", (e) => {
    renderModalList(e.target.value);
  });

  $("modeToggle")?.addEventListener("click", () => {
    setSearchMode(SEARCH_MODE === "relic" ? "items" : "relic");
    const search = $("modalSearch");
    if (search) {
      // when toggling, keep text; render handles it
      renderModalList(search.value);
    }
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
        el.textContent = PICKER_DEFAULT;
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
