/* ==========================================================
   Moses - Warframe Relic Reward Values
   app.js
   ========================================================== */

/* ----------------------------
   DOM helpers
---------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ----------------------------
   Global state
---------------------------- */
const state = {
  relicsMin: null,
  prices: null,
  vaultStatus: null,

  relicNameToAvailable: new Map(), // relicName -> true/false (available/unvaulted)
  relicNameSet: new Set(),

  selectedRelics: ["", "", "", ""],
  results: [],

  // modal / picker state
  pickerOpen: false,
  pickerMode: "relics", // "relics" or "items"
  pickerSlot: 0, // 0-3
  pickerFilter: "all", // "all" | "available" | "vaulted"
  pickerQuery: "",

  // UI status
  statusText: "Ready"
};

/* ----------------------------
   Constants / Data paths
---------------------------- */
const DATA_DIR = "data";
const RELICS_URL = `${DATA_DIR}/Relics.min.json`;
const PRICES_URL = `${DATA_DIR}/prices.json`;
const VAULT_URL = `${DATA_DIR}/vaultStatus.json`;

/* ----------------------------
   Sorting helpers
---------------------------- */
function relic_sort_key(name) {
  // e.g. Lith A1, Meso C3, Neo N16, Axi S18
  // Sort by era order then by code+number
  const eraOrder = { Lith: 0, Meso: 1, Neo: 2, Axi: 3, Requiem: 4, Vanguard: 5 };
  const parts = String(name).trim().split(/\s+/);
  const era = parts[0] || "";
  const rest = parts.slice(1).join(" ");

  // Pull letter(s) + number
  let letter = "";
  let num = 0;
  const m = rest.match(/^([A-Za-z]+)\s*([0-9]+)$/) || rest.match(/^([A-Za-z]+)([0-9]+)$/);
  if (m) {
    letter = m[1] || "";
    num = parseInt(m[2], 10) || 0;
  } else {
    // fallback
    letter = rest;
    num = 0;
  }

  return [
    (eraOrder[era] ?? 999),
    era.toLowerCase(),
    letter.toLowerCase(),
    num,
    name.toLowerCase()
  ];
}

function sortRelicNames(names) {
  return [...names].sort((a, b) => {
    const ka = relic_sort_key(a);
    const kb = relic_sort_key(b);
    for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return 0;
  });
}

/* ----------------------------
   Vault / color helpers
---------------------------- */
function isAvailableRelic(name) {
  if (!name) return false;
  if (!state.relicNameToAvailable.size) return false;
  return !!state.relicNameToAvailable.get(name);
}

function getRelicStatusClass(name) {
  // Return class for coloring text (not dot)
  if (!name) return "";
  const avail = isAvailableRelic(name);
  return avail ? "available" : "vaulted";
}

function formatRelicNameSpan(name) {
  const safe = escapeHtml(name);
  const cls = getRelicStatusClass(name);
  return `<span class="relicName ${cls}">${safe}</span>`;
}

/* ----------------------------
   Build lookup tables
---------------------------- */
function buildVaultLookup(vaultJson) {
  state.relicNameToAvailable.clear();

  if (!vaultJson || !vaultJson.available) return;

  for (const [name, avail] of Object.entries(vaultJson.available)) {
    state.relicNameToAvailable.set(name, !!avail);
  }
}

function buildRelicSet(relicsMin) {
  state.relicNameSet.clear();
  if (!relicsMin || !relicsMin.relics) return;

  for (const r of relicsMin.relics) {
    if (r && r.name) state.relicNameSet.add(r.name);
  }
}

/* ----------------------------
   Fetch data
---------------------------- */
async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return await res.json();
}

async function loadAllData() {
  // Load relics, prices, vault status
  const [relicsMin, prices, vaultStatus] = await Promise.all([
    fetchJson(RELICS_URL),
    fetchJson(PRICES_URL).catch(() => null),
    fetchJson(VAULT_URL).catch(() => null)
  ]);

  state.relicsMin = relicsMin;
  state.prices = prices;
  state.vaultStatus = vaultStatus;

  buildRelicSet(relicsMin);
  buildVaultLookup(vaultStatus);

  updateFooterCounts();
}

/* ----------------------------
   UI: footer counts
---------------------------- */
function updateFooterCounts() {
  const el = $("#footerCounts");
  if (!el) return;

  const relicCount = state.relicNameSet.size || 0;
  let priceCount = 0;
  if (state.prices && state.prices.prices) {
    priceCount = Object.keys(state.prices.prices).length;
  }
  el.textContent = `Relics: ${relicCount} • Price entries: ${priceCount}`;
}

/* ----------------------------
   Rewards computation
---------------------------- */
function getPriceForItem(itemName) {
  if (!state.prices || !state.prices.prices) return null;
  const v = state.prices.prices[itemName];
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function rarityLabel(chance) {
  // chance is a % number, e.g. 2, 11, 25.33
  const c = Number(chance);
  if (!Number.isFinite(c)) return "Unknown";
  if (c <= 2.1) return "Rare";
  if (c <= 11.1) return "Uncommon";
  return "Common";
}

function buildResultsFromSelectedRelics() {
  const chosen = state.selectedRelics.filter(Boolean);
  if (!chosen.length) {
    state.results = [];
    return;
  }

  // Map: itemName -> { itemName, chances: [{relicName, chance}], price }
  const map = new Map();

  const relics = (state.relicsMin && state.relicsMin.relics) ? state.relicsMin.relics : [];
  const byName = new Map(relics.map(r => [r.name, r]));

  for (const relicName of chosen) {
    const relic = byName.get(relicName);
    if (!relic || !relic.rewards) continue;

    for (const rw of relic.rewards) {
      const itemName = rw.item;
      const chance = rw.chance;

      if (!map.has(itemName)) {
        map.set(itemName, {
          itemName,
          chances: [],
          price: getPriceForItem(itemName)
        });
      }
      map.get(itemName).chances.push({ relicName, chance });
    }
  }

  // Build final list with unique items
  const out = [];
  for (const entry of map.values()) {
    // compute a max chance or rarity label based on one of the chances
    // we show the rarity based on the smallest chance among listed (rare < uncommon < common)
    const minChance = entry.chances.reduce((m, x) => {
      const c = Number(x.chance);
      if (!Number.isFinite(c)) return m;
      return Math.min(m, c);
    }, Infinity);
    const label = rarityLabel(minChance);
    out.push({
      itemName: entry.itemName,
      chances: entry.chances,
      rarity: label,
      minChance: Number.isFinite(minChance) ? minChance : null,
      price: entry.price
    });
  }

  // Sort by platinum value desc (nulls last), then name
  out.sort((a, b) => {
    const ap = a.price == null ? -1 : a.price;
    const bp = b.price == null ? -1 : b.price;
    if (bp !== ap) return bp - ap;
    return a.itemName.localeCompare(b.itemName);
  });

  state.results = out;
}

/* ----------------------------
   Render selected relic "dropdown" UI
---------------------------- */
function setRelicSlotText(slot, text) {
  const el = $(`#relicSel${slot + 1}`);
  if (!el) return;
  el.textContent = text || "Tap to choose (Lith/Meso/Neo/Axi)";
}

function renderSelectedRelics() {
  for (let i = 0; i < 4; i++) {
    setRelicSlotText(i, state.selectedRelics[i] || "");
  }
}

/* ----------------------------
   Render results list
---------------------------- */
function renderStatus(text) {
  const el = $("#status");
  if (!el) return;
  el.textContent = text || "";
}

function renderResults() {
  const cards = $("#cards");
  if (!cards) return;

  cards.innerHTML = "";

  const pricedCount = state.results.filter(r => r.price != null).length;
  const uniqueCount = state.results.length;

  const statusRight = $("#status");
  if (statusRight) {
    if (!state.selectedRelics.filter(Boolean).length) {
      renderStatus(state.statusText);
    } else {
      renderStatus(`Showing ${uniqueCount} unique rewards • priced: ${pricedCount}`);
    }
  }

  if (!state.results.length) return;

  for (const r of state.results) {
    const card = document.createElement("div");
    card.className = "card";

    const relicSpans = r.chances
      .map(x => formatRelicNameSpan(x.relicName))
      .join(", ");

    const chanceText = r.minChance != null
      ? `${r.rarity} (${r.minChance}%)`
      : `${r.rarity}`;

    card.innerHTML = `
      <div class="cardRow">
        <div class="cardTitle">${escapeHtml(r.itemName)}</div>
        <div class="cardValue">${r.price != null ? `${r.price}<span class="plat"> Plat</span>` : ""}</div>
      </div>
      <div class="cardMeta">
        <span class="pill">${escapeHtml(chanceText)}</span>
        <span class="relicsInline">${relicSpans}</span>
      </div>
    `;

    cards.appendChild(card);
  }
}

/* ----------------------------
   Actions: Show / Clear
---------------------------- */
function clearAll() {
  state.selectedRelics = ["", "", "", ""];
  state.results = [];
  state.statusText = "Cleared";
  renderSelectedRelics();
  renderResults();
}

function showRewards() {
  state.statusText = "Ready";
  buildResultsFromSelectedRelics();
  renderResults();
}

/* ----------------------------
   Picker modal
---------------------------- */
function openPicker(slotIndex) {
  state.pickerOpen = true;
  state.pickerSlot = slotIndex;

  // default mode stays as last used
  $("#pickerOverlay").classList.add("open");
  $("#pickerSearch").value = "";
  state.pickerQuery = "";
  renderPickerTabs();
  renderPickerFilterRow();
  renderPickerList();
}

function closePicker() {
  state.pickerOpen = false;
  $("#pickerOverlay").classList.remove("open");
}

function setPickerMode(mode) {
  state.pickerMode = mode;
  state.pickerFilter = "all";
  state.pickerQuery = "";
  $("#pickerSearch").value = "";
  renderPickerTabs();
  renderPickerFilterRow();
  renderPickerList();
}

function setPickerFilter(filter) {
  state.pickerFilter = filter;
  renderPickerFilterRow();
  renderPickerList();
}

function renderPickerTabs() {
  const tabRelics = $("#tabRelics");
  const tabItems = $("#tabItems");
  if (!tabRelics || !tabItems) return;

  tabRelics.classList.toggle("active", state.pickerMode === "relics");
  tabItems.classList.toggle("active", state.pickerMode === "items");
}

function renderPickerFilterRow() {
  const row = $("#pickerFilters");
  if (!row) return;

  // Hide filter row in Items mode (as requested)
  if (state.pickerMode === "items") {
    row.style.display = "none";
    return;
  }
  row.style.display = "";

  const bAll = $("#filterAll");
  const bAvail = $("#filterAvail");
  const bVault = $("#filterVault");
  if (!bAll || !bAvail || !bVault) return;

  bAll.classList.toggle("active", state.pickerFilter === "all");
  bAvail.classList.toggle("active", state.pickerFilter === "available");
  bVault.classList.toggle("active", state.pickerFilter === "vaulted");
}

/* ----------------------------
   Picker list builders
---------------------------- */
function buildRelicListForPicker() {
  const all = sortRelicNames(Array.from(state.relicNameSet));

  const q = state.pickerQuery.trim().toLowerCase();
  let filtered = all;

  if (q) {
    filtered = filtered.filter(n => n.toLowerCase().includes(q));
  }

  // Apply filter (available/vaulted)
  if (state.pickerFilter === "available") {
    filtered = filtered.filter(n => isAvailableRelic(n));
  } else if (state.pickerFilter === "vaulted") {
    filtered = filtered.filter(n => !isAvailableRelic(n));
  }

  return filtered;
}

function buildItemListForPicker() {
  // Build unique reward item list from relicsMin
  const map = new Map(); // itemName -> {price, relics:[{relicName}]}

  const relics = (state.relicsMin && state.relicsMin.relics) ? state.relicsMin.relics : [];
  for (const r of relics) {
    if (!r || !r.rewards) continue;
    for (const rw of r.rewards) {
      const itemName = rw.item;
      if (!map.has(itemName)) {
        map.set(itemName, {
          itemName,
          price: getPriceForItem(itemName),
          relics: []
        });
      }
      map.get(itemName).relics.push({ relicName: r.name });
    }
  }

  const list = Array.from(map.values());

  const q = state.pickerQuery.trim().toLowerCase();
  let filtered = list;
  if (q) {
    filtered = filtered.filter(x => x.itemName.toLowerCase().includes(q));
  }

  // Sort by price desc then name
  filtered.sort((a, b) => {
    const ap = a.price == null ? -1 : a.price;
    const bp = b.price == null ? -1 : b.price;
    if (bp !== ap) return bp - ap;
    return a.itemName.localeCompare(b.itemName);
  });

  return filtered;
}

function renderPickerList() {
  const listEl = $("#pickerList");
  if (!listEl) return;

  listEl.innerHTML = "";

  if (state.pickerMode === "relics") {
    const list = buildRelicListForPicker();

    // Status hint text
    const hint = $("#pickerHint");
    if (hint) {
      if (state.pickerFilter === "available") {
        const cntAvail = sortRelicNames(Array.from(state.relicNameSet)).filter(n => isAvailableRelic(n)).length;
        hint.textContent = `Showing unvaulted only • ${cntAvail}`;
      } else if (state.pickerFilter === "vaulted") {
        const cntVault = sortRelicNames(Array.from(state.relicNameSet)).filter(n => !isAvailableRelic(n)).length;
        hint.textContent = `Showing vaulted only • ${cntVault}`;
      } else {
        const cntAvail = sortRelicNames(Array.from(state.relicNameSet)).filter(n => isAvailableRelic(n)).length;
        const cntVault = sortRelicNames(Array.from(state.relicNameSet)).filter(n => !isAvailableRelic(n)).length;
        hint.textContent = `Available: ${cntAvail} • Vaulted: ${cntVault}`;
      }
    }

    for (const name of list) {
      const row = document.createElement("button");
      row.className = "modalRow";
      row.type = "button";
      row.innerHTML = `
        <div class="modalRowLeft">
          <div class="modalTitle">${escapeHtml(name)}</div>
          <div class="modalSub">Tap to select</div>
        </div>
        <div class="statusDot ${getRelicStatusClass(name)}"></div>
      `;

      row.addEventListener("click", () => {
        state.selectedRelics[state.pickerSlot] = name;
        renderSelectedRelics();
        state.statusText = "Ready";
        renderResults();
        closePicker();
      });

      listEl.appendChild(row);
    }

    return;
  }

  // Items mode
  const items = buildItemListForPicker();
  const hint = $("#pickerHint");
  if (hint) hint.textContent = "";

  for (const info of items) {
    const row = document.createElement("button");
    row.className = "modalRow modalItem";
    row.type = "button";

    // ---- FIX: render relic names as colored spans (green/red text) ----
    const relicPreviewHtml = info.relics
      .slice(0, 10)
      .map(e => formatRelicNameSpan(e.relicName))
      .join(" • ");
    const relicMore = info.relics.length > 10 ? " …" : "";

    const titleSafe = escapeHtml(info.itemName);
    const platSafe = (info.price != null) ? `${info.price}` : "";

    row.innerHTML = `
      <div class="modalTitleRow">
        <div class="modalTitle">${titleSafe}</div>
        <div class="modalPlat">${platSafe ? `${platSafe} Plat` : ""}</div>
      </div>
      <div class="modalSub">${relicPreviewHtml}${relicMore}</div>
    `;

    row.addEventListener("click", () => {
      // show item detail view
      renderItemDetailView(info.itemName);
    });

    listEl.appendChild(row);
  }
}

/* ----------------------------
   Items detail view
---------------------------- */
function renderItemDetailView(itemName) {
  const listEl = $("#pickerList");
  if (!listEl) return;

  // Find item again
  const items = buildItemListForPicker();
  const info = items.find(x => x.itemName === itemName);
  if (!info) return;

  // Build all relic chips
  const relics = info.relics.map(x => x.relicName);
  const sorted = sortRelicNames(relics);

  const backBtn = document.createElement("button");
  backBtn.className = "modalBack";
  backBtn.type = "button";
  backBtn.innerHTML = `&larr; Back`;
  backBtn.addEventListener("click", () => {
    renderPickerList();
  });

  listEl.innerHTML = "";
  listEl.appendChild(backBtn);

  const title = document.createElement("div");
  title.className = "modalItemTitle";
  title.innerHTML = `
    <div class="modalTitleRow">
      <div class="modalTitle">${escapeHtml(info.itemName)}</div>
      <div class="modalPlat">${info.price != null ? `${info.price} Plat` : ""}</div>
    </div>
  `;
  listEl.appendChild(title);

  for (const rn of sorted) {
    const row = document.createElement("div");
    row.className = "modalItemRelicRow";
    row.innerHTML = `
      ${formatRelicNameSpan(rn)}
    `;
    listEl.appendChild(row);
  }
}

/* ----------------------------
   Wire up events
---------------------------- */
function bindEvents() {
  // open picker on slot click
  for (let i = 0; i < 4; i++) {
    const el = $(`#relicPick${i + 1}`);
    if (el) {
      el.addEventListener("click", () => openPicker(i));
    }
  }

  // actions
  $("#btnShow")?.addEventListener("click", showRewards);
  $("#btnClear")?.addEventListener("click", clearAll);

  // picker overlay close
  $("#pickerClose")?.addEventListener("click", closePicker);
  $("#pickerOverlay")?.addEventListener("click", (e) => {
    if (e.target && e.target.id === "pickerOverlay") closePicker();
  });

  // tabs
  $("#tabRelics")?.addEventListener("click", () => setPickerMode("relics"));
  $("#tabItems")?.addEventListener("click", () => setPickerMode("items"));

  // filters (relics mode only)
  $("#filterAll")?.addEventListener("click", () => setPickerFilter("all"));
  $("#filterAvail")?.addEventListener("click", () => setPickerFilter("available"));
  $("#filterVault")?.addEventListener("click", () => setPickerFilter("vaulted"));

  // search
  $("#pickerSearch")?.addEventListener("input", debounce((e) => {
    state.pickerQuery = e.target.value || "";
    renderPickerList();
  }, 100));
}

/* ----------------------------
   Init
---------------------------- */
async function init() {
  bindEvents();
  renderSelectedRelics();
  renderResults();
  renderStatus(state.statusText);

  try {
    await loadAllData();
    renderSelectedRelics();
    renderResults();
    renderStatus(state.statusText);
  } catch (err) {
    console.error(err);
    renderStatus("Failed to load data");
  }
}

document.addEventListener("DOMContentLoaded", init);

/* ==========================================================
   End of app.js
   ========================================================== */
