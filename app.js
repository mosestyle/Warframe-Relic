// app.js — Modal picker UI + prices from data/prices.json ONLY.

let RELICS = [];
let PRICES = {};
let RELIC_NAMES = [];
let VAULT_STATUS = null; // { "Lith K12": true/false } true = available

const state = { r1: null, r2: null, r3: null, r4: null };
const PICKER_DEFAULT = "Tap to choose (Lith/Meso/Neo/Axi)";

const $ = (id) => document.getElementById(id);

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

  return a.localeCompare(a);
}

// ---------------- Item -> relic index ----------------
let ITEM_TO_RELICS = null;

// { keyLower: { displayName, plat, relics: [{ relicName, rarityLabel }] } }
function buildItemIndex() {
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
        map.set(key, { displayName: item, relics: [] });
      }

      map.get(key).relics.push({ relicName: rname, rarityLabel });
    }
  }

  // de-dupe and sort relic lists
  for (const info of map.values()) {
    const seen = new Set();
    const out = [];
    for (const e of info.relics) {
      const k = `${e.relicName}__${e.rarityLabel}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
    }
    out.sort((a, b) => relicNaturalCompare(a.relicName, b.relicName));
    info.relics = out;

    // attach plat once at build time
    info.plat = platForItem(info.displayName);
  }

  ITEM_TO_RELICS = map;
}

// ---------------- Modal picker + 2 buttons ----------------
let modalTarget = null;
let SEARCH_MODE = "relic";  // "relic" or "items"
let ITEM_DETAIL = null;     // {displayName, plat, relics:[...]} when drilling into an item

function setButtonsActive() {
  const bR = $("modeRelics");
  const bI = $("modeItems");
  if (!bR || !bI) return;

  if (SEARCH_MODE === "items") {
    bR.classList.remove("active");
    bI.classList.add("active");
  } else {
    bI.classList.remove("active");
    bR.classList.add("active");
  }
}

function setSearchMode(mode) {
  SEARCH_MODE = (mode === "items") ? "items" : "relic";
  ITEM_DETAIL = null;

  setButtonsActive();

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

  // Always default to Relics (as requested)
  setSearchMode("relic");

  modal.classList.remove("hidden");
  setTimeout(() => search?.focus(), 60);
}

function closeModal() {
  const modal = $("modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modalTarget = null;
  ITEM_DETAIL = null;
}

function pickRelic(relicName) {
  if (!modalTarget) return;

  state[modalTarget] = relicName;

  const tEl = $(`${modalTarget}Text`);
  if (tEl) {
    tEl.textContent = relicName;
    tEl.classList.remove("pickerPlaceholder");
  }

  closeModal();
}

function renderItemDetailView() {
  const listEl = $("modalList");
  if (!listEl || !ITEM_DETAIL) return;

  listEl.innerHTML = "";

  // Back row
  const back = document.createElement("div");
  back.className = "modalItem";
  back.innerHTML = `
    <div class="modalBack">
      <strong>← Back</strong>
    </div>
    <span>Back to item results</span>
  `;
  back.addEventListener("click", () => {
    ITEM_DETAIL = null;
    renderModalList($("modalSearch")?.value || "");
  });
  listEl.appendChild(back);

  // Header row (item + price)
  const header = document.createElement("div");
  header.className = "modalItem";
  header.innerHTML = `
    <div class="modalRowTop">
      <strong>${ITEM_DETAIL.displayName}</strong>
      <span class="modalPrice">${typeof ITEM_DETAIL.plat === "number" ? `${ITEM_DETAIL.plat} Plat` : "?"}</span>
    </div>
    <span>Select which relic to pick</span>
  `;
  listEl.appendChild(header);

  // Relic list
  if (!ITEM_DETAIL.relics || ITEM_DETAIL.relics.length === 0) {
    const row = document.createElement("div");
    row.className = "modalItem";
    row.innerHTML = `<strong>No relic match</strong><span>Try clearing the search</span>`;
    listEl.appendChild(row);
    return;
  }

  for (const e of ITEM_DETAIL.relics.slice(0, 250)) {
    const row = document.createElement("div");
    row.className = "modalItem";
    row.innerHTML = `
      <div class="modalRowTop">
        <strong>${e.relicName}</strong>
      </div>
      <span>${e.rarityLabel || "Tap to select"}</span>
    `;
    row.addEventListener("click", () => pickRelic(e.relicName));
    listEl.appendChild(row);
  }
}

function renderModalList(filter) {
  const listEl = $("modalList");
  if (!listEl) return;

  // If we are in item drilldown view
  if (SEARCH_MODE === "items" && ITEM_DETAIL) {
    renderItemDetailView();
    return;
  }

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

    // Collect matches (keep fast)
    const matches = [];
    for (const [key, info] of ITEM_TO_RELICS.entries()) {
      if (key.includes(q)) matches.push(info);
      if (matches.length >= 60) break;
    }

    if (matches.length === 0) {
      const row = document.createElement("div");
      row.className = "modalItem";
      row.innerHTML = `<strong>No item match</strong><span>Try shorter (e.g. wisp neuroptics)</span>`;
      listEl.appendChild(row);
      return;
    }

    // Sort matches by plat desc (unknown last), then name
    matches.sort((a, b) => {
      const ap = (typeof a.plat === "number") ? a.plat : -1;
      const bp = (typeof b.plat === "number") ? b.plat : -1;
      if (bp !== ap) return bp - ap;
      return a.displayName.localeCompare(b.displayName);
    });

    for (const info of matches.slice(0, 20)) {
      const relicPreview = info.relics
        .slice(0, 10)
        .map(e => e.relicName)
        .join(" • ");

      const priceText = (typeof info.plat === "number") ? `${info.plat} Plat` : "?";

      const row = document.createElement("div");
      row.className = "modalItem";
      row.innerHTML = `
        <div class="modalRowTop">
          <strong>${info.displayName}</strong>
          <span class="modalPrice">${priceText}</span>
        </div>
        <div class="modalSub">${relicPreview}${info.relics.length > 10 ? " …" : ""}</div>
      `;

      // Click -> open drilldown list to choose relic
      row.addEventListener("click", () => {
        ITEM_DETAIL = info;
        renderItemDetailView();
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
    row.addEventListener("click", () => pickRelic(name));
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

  // merge duplicates
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
    fromList: [...x.fromSet].sort(relicNaturalCompare),
    rarity: x.rarity,
    plat: x.plat
  }));

  final.sort((a, b) => b.plat - a.plat);
  return final;
}

function relicClass(relicName) {
  if (!VAULT_STATUS || typeof VAULT_STATUS[relicName] !== "boolean") return "";
  return VAULT_STATUS[relicName] ? "relicAvail" : "relicVault";
}

function renderFromList(fromList) {
  return fromList
    .map(rname => {
      const cls = relicClass(rname);
      return cls ? `<span class="${cls}">${rname}</span>` : rname;
    })
    .join(", ");
}

function renderCards(list) {
  const cardsEl = $("cards");
  if (!cardsEl) return;

  cardsEl.innerHTML = "";
  for (const e of list) {
    const fromHtml = renderFromList(e.fromList || []);
    const div = document.createElement("div");
    div.className = "cardRow";
    div.innerHTML = `
      <div class="cardLeft">
        <div class="itemName">${e.item}</div>
        <div class="itemMeta">
          <span class="badge">${e.rarity || ""}</span>
          <span>${fromHtml}</span>
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

  // NEW: load vault status from wiki-generated file (optional)
  try {
    const vaultRes = await fetch("./data/vaultStatus.json", { cache: "no-store" });
    VAULT_STATUS = await vaultRes.json();
  } catch {
    VAULT_STATUS = null;
  }

  RELIC_NAMES = RELICS.map(relicDisplayName).sort(relicNaturalCompare);

  // Build item index once
  buildItemIndex();

  const footer = $("footer");
  if (footer) footer.textContent = `Relics: ${RELICS.length} • Price entries: ${Object.keys(PRICES).length}`;

  $("modalClose")?.addEventListener("click", closeModal);
  $("modalSearch")?.addEventListener("input", (e) => renderModalList(e.target.value));

  // two separate mode buttons
  $("modeRelics")?.addEventListener("click", () => setSearchMode("relic"));
  $("modeItems")?.addEventListener("click", () => setSearchMode("items"));

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

  // Ensure initial active button state
  setSearchMode("relic");

  setStatus("Ready");
}

document.addEventListener("DOMContentLoaded", () => {
  boot().catch(err => {
    console.error(err);
    setStatus("Failed to load data");
  });
});
