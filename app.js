/* app.js */

// ====== DOM ======
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const elRelic1 = $("#relic1");
const elRelic2 = $("#relic2");
const elRelic3 = $("#relic3");
const elRelic4 = $("#relic4");

const btnShow = $("#btnShow");
const btnClear = $("#btnClear");
const statusEl = $("#status");

const cardsEl = $("#cards");

const modal = $("#pickerModal");
const modalTitle = $("#pickerTitle");
const modalClose = $("#pickerClose");
const modalSearch = $("#pickerSearch");
const modalTabs = $("#pickerTabs");
const modalList = $("#pickerList");

// ====== DATA (loaded) ======
let RELICS = [];     // data/Relics.min.json
let PRICES = {};     // data/prices.json (name -> plat)
let VAULT = null;    // data/vaultStatus.json { generated_at, available: { "Lith A1": true/false } }

let ITEM_INDEX = null; // optional cached index from RELICS (built on load)

// ====== STATE ======
const state = {
  selected: [null, null, null, null], // relic names
  lastPickerTargetIndex: 0,           // 0..3
  pickerMode: "relics",               // "relics" | "items"
  pickerQuery: "",
};

// ====== HELPERS ======
function safeNum(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

function relicSortKey(name) {
  // e.g. Lith A1, Meso Z3, Neo A10, Axi A2
  // Sort by era order then letter/number.
  const m = String(name).match(/^(Lith|Meso|Neo|Axi)\s+([A-Z]+)(\d+)$/i);
  if (!m) return [999, name];
  const era = m[1].toLowerCase();
  const eraOrder = { lith: 0, meso: 1, neo: 2, axi: 3 };
  const letter = m[2].toUpperCase();
  const num = parseInt(m[3], 10);
  return [eraOrder[era] ?? 999, letter, num];
}

function fmtPlat(n) {
  const x = safeNum(n);
  if (x === null) return "";
  // no decimals (prices are already integers in your data)
  return String(Math.round(x));
}

function normalizeName(s) {
  return String(s || "").trim();
}

function relicIsAvailable(name) {
  if (!VAULT || !VAULT.available) return null; // unknown
  const v = VAULT.available[name];
  if (typeof v !== "boolean") return null;
  return v;
}

function formatRelicNameSpan(name) {
  const isAvail = relicIsAvailable(name);
  if (isAvail === true) return `<span class="relicName available">${name}</span>`;
  if (isAvail === false) return `<span class="relicName vaulted">${name}</span>`;
  return `<span class="relicName">${name}</span>`;
}

function formatFromRelicsHtml(fromRelics) {
  // fromRelics: array of relic names
  if (!fromRelics || !fromRelics.length) return "";
  return fromRelics.map(formatRelicNameSpan).join(", ");
}

function buildItemIndex() {
  // Build item -> [{ itemName, price, relicName }] AND also item -> relic list
  // RELICS structure expected:
  // [
  //   { name: "Lith A1", era: "Lith", rewards: [{name, rarity, chance}, ...] },
  //   ...
  // ]
  const map = new Map(); // itemName -> { price, relics: Set(relicName) }
  for (const r of RELICS) {
    const relicName = r.name;
    const rewards = r.rewards || r.Rewards || r.items || [];
    for (const rw of rewards) {
      const itemName = normalizeName(rw.name || rw.item || rw.reward);
      if (!itemName) continue;
      if (!map.has(itemName)) {
        map.set(itemName, {
          itemName,
          price: PRICES[itemName] ?? null,
          relics: new Set(),
        });
      }
      map.get(itemName).relics.add(relicName);
    }
  }

  // Convert relic sets to sorted arrays
  const items = [];
  for (const v of map.values()) {
    const relics = Array.from(v.relics);
    relics.sort((a, b) => {
      const ak = relicSortKey(a);
      const bk = relicSortKey(b);
      return ak < bk ? -1 : ak > bk ? 1 : 0;
    });
    items.push({
      itemName: v.itemName,
      price: v.price,
      relics,
    });
  }

  // Sort items by price desc, then name
  items.sort((a, b) => {
    const ap = safeNum(a.price);
    const bp = safeNum(b.price);
    if (ap === null && bp === null) return a.itemName.localeCompare(b.itemName);
    if (ap === null) return 1;
    if (bp === null) return -1;
    if (bp !== ap) return bp - ap;
    return a.itemName.localeCompare(b.itemName);
  });

  ITEM_INDEX = items;
}

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function getSelectedRelics() {
  return state.selected.filter(Boolean);
}

function unique(arr) {
  return Array.from(new Set(arr));
}

function loadJSON(url) {
  return fetch(url, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
    return r.json();
  });
}

// ====== UI POPULATE ======
function fillRelicDropdown(selectEl) {
  selectEl.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "Tap to choose (Lith/Meso/Neo/Axi)";
  selectEl.appendChild(opt0);

  for (const r of RELICS) {
    const opt = document.createElement("option");
    opt.value = r.name;
    opt.textContent = r.name;
    selectEl.appendChild(opt);
  }
}

function refreshDropdowns() {
  fillRelicDropdown(elRelic1);
  fillRelicDropdown(elRelic2);
  fillRelicDropdown(elRelic3);
  fillRelicDropdown(elRelic4);

  // restore selection
  [elRelic1, elRelic2, elRelic3, elRelic4].forEach((el, i) => {
    el.value = state.selected[i] || "";
  });
}

function clearResults() {
  cardsEl.innerHTML = "";
}

// ====== REWARD LOGIC ======
function collectRewardsFromRelics(relicNames) {
  const rewards = []; // { itemName, rarity, chance, fromRelics: [] }
  const byItem = new Map();

  for (const relicName of relicNames) {
    const relic = RELICS.find((r) => r.name === relicName);
    if (!relic) continue;

    const entries = relic.rewards || relic.Rewards || relic.items || [];
    for (const e of entries) {
      const itemName = normalizeName(e.name || e.item || e.reward);
      if (!itemName) continue;

      const rarity = normalizeName(e.rarity || e.tier || e.Rarity);
      const chance = safeNum(e.chance ?? e.Chance ?? e.probability);

      if (!byItem.has(itemName)) {
        byItem.set(itemName, {
          itemName,
          rarity: rarity || "",
          chance: chance,
          fromRelics: [relicName],
          price: PRICES[itemName] ?? null,
        });
      } else {
        const obj = byItem.get(itemName);
        obj.fromRelics.push(relicName);
      }
    }
  }

  for (const obj of byItem.values()) {
    obj.fromRelics = unique(obj.fromRelics);
    obj.fromRelics.sort((a, b) => {
      const ak = relicSortKey(a);
      const bk = relicSortKey(b);
      return ak < bk ? -1 : ak > bk ? 1 : 0;
    });
    rewards.push(obj);
  }

  rewards.sort((a, b) => {
    const ap = safeNum(a.price);
    const bp = safeNum(b.price);
    if (ap === null && bp === null) return a.itemName.localeCompare(b.itemName);
    if (ap === null) return 1;
    if (bp === null) return -1;
    if (bp !== ap) return bp - ap;
    return a.itemName.localeCompare(b.itemName);
  });

  return rewards;
}

function renderRewards(rewards) {
  clearResults();

  const pricedCount = rewards.filter((r) => safeNum(r.price) !== null).length;
  setStatus(`Showing ${rewards.length} unique rewards • priced: ${pricedCount}`);

  for (const r of rewards) {
    const price = fmtPlat(r.price);
    const fromHtml = formatFromRelicsHtml(r.fromRelics);

    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <div class="cardRow">
        <div class="cardTitle">${r.itemName}</div>
        <div class="cardPrice">${price ? `${price}<span class="platUnit">Plat</span>` : ""}</div>
      </div>
      <div class="cardMeta">
        <span class="pill">${r.rarity || "—"}${r.chance !== null ? ` (${r.chance}%)` : ""}</span>
        <span class="fromRelics">${fromHtml}</span>
      </div>
    `;

    cardsEl.appendChild(card);
  }
}

// ====== PICKER MODAL ======
function openPicker(index) {
  state.lastPickerTargetIndex = index;
  state.pickerMode = "relics";
  state.pickerQuery = "";

  modalTitle.textContent = "Choose relic";
  modalSearch.value = "";
  modalSearch.placeholder = "Search relic…";

  // tabs
  setPickerTab("relics");

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  modalSearch.focus();
}

function closePicker() {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function setPickerTab(mode) {
  state.pickerMode = mode;

  $$("#pickerTabs button").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === mode);
  });

  if (mode === "relics") {
    modalTitle.textContent = "Choose relic";
    modalSearch.placeholder = "Search relic…";
    renderRelicPickerList();
  } else {
    modalTitle.textContent = "Choose item";
    modalSearch.placeholder = "Search item…";
    renderItemPickerList();
  }
}

function renderRelicPickerList() {
  const q = normalizeName(modalSearch.value).toLowerCase();

  const filtered = RELICS
    .map((r) => r.name)
    .filter((name) => !q || name.toLowerCase().includes(q))
    .sort((a, b) => {
      const ak = relicSortKey(a);
      const bk = relicSortKey(b);
      return ak < bk ? -1 : ak > bk ? 1 : 0;
    });

  modalList.innerHTML = "";

  for (const name of filtered) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "pickerRow";
    row.innerHTML = `
      <div class="pickerMain">
        <div class="pickerTitle">${name}</div>
      </div>
    `;
    row.addEventListener("click", () => {
      state.selected[state.lastPickerTargetIndex] = name;
      refreshDropdowns();
      closePicker();
    });
    modalList.appendChild(row);
  }
}

function renderItemPickerList() {
  if (!ITEM_INDEX) buildItemIndex();

  const q = normalizeName(modalSearch.value).toLowerCase();
  const matches = ITEM_INDEX.filter((it) => !q || it.itemName.toLowerCase().includes(q));

  modalList.innerHTML = "";

  // show top N for speed
  const limited = matches.slice(0, 200);

  for (const it of limited) {
    const price = fmtPlat(it.price);

    // We'll show up to 10 relics in preview
    const previewRelics = it.relics.slice(0, 10);
    const more = it.relics.length > 10 ? ` • +${it.relics.length - 10} more` : "";

    // NOTE: This is where the coloring fix is applied:
    // Use formatRelicNameSpan() so relic names become green/red like the rewards list.
    const relicPreview = previewRelics.map((r) => formatRelicNameSpan(r)).join(" • ") + more;

    const row = document.createElement("button");
    row.type = "button";
    row.className = "pickerRow";

    row.innerHTML = `
      <div class="pickerMain">
        <div class="pickerTitleRow">
          <div class="pickerTitle">${it.itemName}</div>
          <div class="pickerPrice">${price ? `${price} Plat` : ""}</div>
        </div>
        <div class="pickerSub">${relicPreview}</div>
      </div>
    `;

    row.addEventListener("click", () => {
      // When clicking an item, we open a mini list of relics that contain it.
      openRelicsForItem(it);
    });

    modalList.appendChild(row);
  }
}

function openRelicsForItem(it) {
  // switch to relic-selection view for a chosen item
  state.pickerMode = "relics";
  modalTitle.textContent = "Choose relic";
  modalSearch.value = "";
  modalSearch.placeholder = "Search relic…";

  // render only relics for this item
  const relics = it.relics.slice().sort((a, b) => {
    const ak = relicSortKey(a);
    const bk = relicSortKey(b);
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });

  modalList.innerHTML = "";

  for (const name of relics) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "pickerRow";
    row.innerHTML = `
      <div class="pickerMain">
        <div class="pickerTitle">${name}</div>
      </div>
    `;
    row.addEventListener("click", () => {
      state.selected[state.lastPickerTargetIndex] = name;
      refreshDropdowns();
      closePicker();
    });
    modalList.appendChild(row);
  }
}

// ====== EVENTS ======
function bindDropdown(selectEl, idx) {
  selectEl.addEventListener("change", () => {
    const v = selectEl.value || null;
    state.selected[idx] = v;
  });

  // On click/tap open picker (mobile-friendly)
  selectEl.addEventListener("click", (ev) => {
    // open modal picker on tap anywhere
    // (but allow native dropdown in desktop if wanted)
    // We'll always open the picker to keep behavior consistent.
    ev.preventDefault();
    openPicker(idx);
  });
}

function bindEvents() {
  bindDropdown(elRelic1, 0);
  bindDropdown(elRelic2, 1);
  bindDropdown(elRelic3, 2);
  bindDropdown(elRelic4, 3);

  btnShow.addEventListener("click", () => {
    const chosen = getSelectedRelics();
    if (!chosen.length) {
      setStatus("Pick at least 1 relic.");
      clearResults();
      return;
    }
    const rewards = collectRewardsFromRelics(chosen);
    renderRewards(rewards);
  });

  btnClear.addEventListener("click", () => {
    state.selected = [null, null, null, null];
    refreshDropdowns();
    clearResults();
    setStatus("Cleared");
  });

  modalClose.addEventListener("click", closePicker);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closePicker();
  });

  modalTabs.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tab]");
    if (!btn) return;
    setPickerTab(btn.dataset.tab);
  });

  modalSearch.addEventListener("input", () => {
    if (state.pickerMode === "relics") renderRelicPickerList();
    else renderItemPickerList();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) {
      closePicker();
    }
  });
}

// ====== INIT ======
async function init() {
  try {
    setStatus("Loading…");

    // load data
    const [relics, prices, vault] = await Promise.all([
      loadJSON("data/Relics.min.json"),
      loadJSON("data/prices.json"),
      loadJSON("data/vaultStatus.json").catch(() => null),
    ]);

    RELICS = Array.isArray(relics) ? relics : (relics.relics || relics.data || []);
    PRICES = prices || {};
    VAULT = vault;

    // normalize relic list
    RELICS = RELICS
      .map((r) => ({
        ...r,
        name: normalizeName(r.name || r.relic || r.relicName),
        rewards: r.rewards || r.Rewards || r.items || r.Items || [],
      }))
      .filter((r) => r.name);

    // ensure stable sort order
    RELICS.sort((a, b) => {
      const ak = relicSortKey(a.name);
      const bk = relicSortKey(b.name);
      return ak < bk ? -1 : ak > bk ? 1 : 0;
    });

    refreshDropdowns();
    bindEvents();

    // footer counts (if present)
    const statsEl = $("#stats");
    if (statsEl) {
      const relicCount = RELICS.length;
      const priceCount = Object.keys(PRICES || {}).length;
      statsEl.textContent = `Relics: ${relicCount} • Price entries: ${priceCount}`;
    }

    setStatus("Ready");
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message || err}`);
  }
}

init();
