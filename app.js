/* ===========================
   Moses - Warframe Relic Reward Values
   app.js
   =========================== */

/* ---------- Config / Paths ---------- */

const RELICS_URL = "data/Relics.min.json";
const PRICES_URL = "data/prices.json";
const VAULT_URL  = "data/vaultStatus.json";

/* ---------- State ---------- */

let RELICS_MIN = null;          // loaded Relics.min.json
let PRICES = null;              // loaded prices.json
let VAULT_STATUS = null;        // loaded vaultStatus.json { available: { "Lith A1": true/false } }

let selectedRelics = ["", "", "", ""];   // relic1..4
let lastRewards = [];                   // last computed reward rows

/* Modal */
let modalOpen = false;
let modalMode = "relics"; // "relics" | "items"
let modalSlotIndex = 0;   // which relic dropdown opened (0..3)
let modalFilter = "all";  // relic filter: all | available | vaulted
let modalQuery = "";

/* ---------- DOM ---------- */

const elStatus   = document.getElementById("status");
const elCards    = document.getElementById("cards");

const sel1 = document.getElementById("relic1");
const sel2 = document.getElementById("relic2");
const sel3 = document.getElementById("relic3");
const sel4 = document.getElementById("relic4");

const btnShow = document.getElementById("btnShow");
const btnClear = document.getElementById("btnClear");

/* Modal DOM */
const elModal = document.getElementById("modal");
const elModalTitle = document.getElementById("modalTitle");
const elModalClose = document.getElementById("modalClose");
const elModalModeRelics = document.getElementById("modeRelics");
const elModalModeItems = document.getElementById("modeItems");
const elModalFiltersRow = document.getElementById("modalFilters");
const elModalFilterAll = document.getElementById("filterAll");
const elModalFilterAvail = document.getElementById("filterAvail");
const elModalFilterVault = document.getElementById("filterVault");
const elModalSearch = document.getElementById("modalSearch");
const elModalList = document.getElementById("modalList");
const elModalHint = document.getElementById("modalHint");

/* ---------- Helpers ---------- */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

function norm(s) {
  return String(s || "").trim();
}

function relic_sort_key(name) {
  // Sort like Lith A1, Lith A2 ... Meso ...
  // Split by space, then by letter+number
  const parts = name.split(" ");
  const era = parts[0] || "";
  const code = parts[1] || "";
  const letter = code.replace(/[0-9]/g, "");
  const num = parseInt(code.replace(/\D/g, ""), 10) || 0;
  return [era, letter, num];
}

function relicEra(name) {
  return (name || "").split(" ")[0] || "";
}

function relicIsAvailable(name) {
  if (!VAULT_STATUS || !VAULT_STATUS.available) return null; // unknown
  const v = VAULT_STATUS.available[name];
  if (typeof v !== "boolean") return null;
  return v;
}

function vaultClassForRelic(name) {
  const avail = relicIsAvailable(name);
  if (avail === true) return "available";
  if (avail === false) return "vaulted";
  return ""; // unknown/no color
}

function formatRelicNameSpan(name) {
  const cls = vaultClassForRelic(name);
  const safe = escapeHtml(name);
  if (!cls) return safe;
  return `<span class="relicName ${cls}">${safe}</span>`;
}

/* Optional dot UI (used in relic modal list) */
function relicDotHtml(name) {
  const cls = vaultClassForRelic(name);
  if (!cls) return `<span class="dot unknown"></span>`;
  return `<span class="dot ${cls}"></span>`;
}

/* ---------- Data Loading ---------- */

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return await res.json();
}

async function loadAll() {
  setStatus("Loading data…");

  const [relics, prices, vault] = await Promise.all([
    fetchJson(RELICS_URL),
    fetchJson(PRICES_URL),
    fetchJson(VAULT_URL).catch(() => null) // vault can be missing early
  ]);

  RELICS_MIN = relics;
  PRICES = prices;
  VAULT_STATUS = vault;

  // build dropdown placeholders
  rebuildRelicSelectLabels();
  setStatus(`Relics: ${relicCount()} • Price entries: ${priceCount()}`);
}

function relicCount() {
  if (!RELICS_MIN) return 0;
  return Array.isArray(RELICS_MIN) ? RELICS_MIN.length : (RELICS_MIN.relics ? RELICS_MIN.relics.length : 0);
}

function priceCount() {
  if (!PRICES) return 0;
  if (Array.isArray(PRICES)) return PRICES.length;
  if (PRICES && typeof PRICES === "object") return Object.keys(PRICES).length;
  return 0;
}

function setStatus(msg) {
  if (elStatus) elStatus.textContent = msg;
}

/* ---------- Relic Select UI ---------- */

function rebuildRelicSelectLabels() {
  // These "selects" are actually clickable fake inputs in your UI (modal-driven)
  // but we keep the ids.
  const s = selectedRelics;

  if (sel1) sel1.value = s[0] || "";
  if (sel2) sel2.value = s[1] || "";
  if (sel3) sel3.value = s[2] || "";
  if (sel4) sel4.value = s[3] || "";

  setRelicPlaceholder(sel1, s[0]);
  setRelicPlaceholder(sel2, s[1]);
  setRelicPlaceholder(sel3, s[2]);
  setRelicPlaceholder(sel4, s[3]);
}

function setRelicPlaceholder(el, value) {
  if (!el) return;
  if (value) {
    el.classList.remove("placeholder");
  } else {
    el.classList.add("placeholder");
  }
}

/* ---------- Reward Computation ---------- */

function getRelicsArray() {
  if (!RELICS_MIN) return [];
  if (Array.isArray(RELICS_MIN)) return RELICS_MIN;
  if (Array.isArray(RELICS_MIN.relics)) return RELICS_MIN.relics;
  return [];
}

function getRelicByName(name) {
  const relics = getRelicsArray();
  return relics.find(r => r.name === name) || null;
}

function getRewardsForSelected() {
  const picked = selectedRelics.filter(Boolean);
  const allRows = [];

  for (const relicName of picked) {
    const relic = getRelicByName(relicName);
    if (!relic || !Array.isArray(relic.rewards)) continue;

    for (const rw of relic.rewards) {
      const item = rw.item;
      const chance = rw.chance; // percent
      const rarity = rw.rarity;

      // price lookup
      const price = getPrice(item);

      allRows.push({
        item,
        price,
        chance,
        rarity,
        relicName
      });
    }
  }

  // merge by item (unique rewards), keep max price and collect relics
  const map = new Map();
  for (const row of allRows) {
    const key = row.item;
    if (!map.has(key)) {
      map.set(key, {
        item: row.item,
        price: row.price,
        rarity: row.rarity,
        chance: row.chance,
        relicNames: new Set([row.relicName])
      });
    } else {
      const e = map.get(key);
      e.price = Math.max(e.price, row.price);
      e.relicNames.add(row.relicName);
    }
  }

  const out = Array.from(map.values()).map(x => ({
    item: x.item,
    price: x.price,
    rarity: x.rarity,
    chance: x.chance,
    relicNames: Array.from(x.relicNames).sort((a, b) => {
      const ka = relic_sort_key(a);
      const kb = relic_sort_key(b);
      return ka[0].localeCompare(kb[0]) || ka[1].localeCompare(kb[1]) || (ka[2] - kb[2]);
    })
  }));

  // sort by price desc
  out.sort((a, b) => (b.price - a.price) || a.item.localeCompare(b.item));
  return out;
}

function getPrice(itemName) {
  if (!PRICES) return 0;

  // Support both object and list formats
  if (typeof PRICES === "object" && !Array.isArray(PRICES)) {
    const v = PRICES[itemName];
    return (typeof v === "number") ? v : 0;
  }

  if (Array.isArray(PRICES)) {
    const f = PRICES.find(x => x.name === itemName);
    return f && typeof f.price === "number" ? f.price : 0;
  }

  return 0;
}

/* ---------- Rendering: Rewards ---------- */

function renderRewards(rows) {
  lastRewards = rows;

  if (!rows || rows.length === 0) {
    elCards.innerHTML = "";
    setStatus("Ready");
    return;
  }

  const pricedCount = rows.filter(r => r.price > 0).length;
  setStatus(`Showing ${rows.length} unique rewards • priced: ${pricedCount}`);

  elCards.innerHTML = rows.map(r => {
    const rarityText = formatRarity(r.rarity, r.chance);
    const priceText = r.price > 0 ? `${Math.round(r.price)}<div class="sub">Plat</div>` : `<span class="muted">—</span>`;

    // show first relic (as label) - keep your existing behavior:
    const firstRelic = r.relicNames[0] || "";
    const relicHtml = firstRelic ? formatRelicNameSpan(firstRelic) : "";

    return `
      <div class="cardRow">
        <div class="left">
          <div class="title">${escapeHtml(r.item)}</div>
          <div class="meta">
            <span class="pill">${escapeHtml(rarityText)}</span>
            ${firstRelic ? `<span class="relicInline">${relicHtml}</span>` : ``}
          </div>
        </div>
        <div class="right">
          <div class="price">${priceText}</div>
        </div>
      </div>
      <div class="divider"></div>
    `;
  }).join("");
}

function formatRarity(rarity, chance) {
  const c = (typeof chance === "number") ? chance : 0;
  if (!rarity) return `${c}%`;
  // "Rare (2%)"
  return `${rarity} (${trimChance(c)})`;
}

function trimChance(c) {
  // keep like 25.33%, 11%, 2%
  const s = (Math.round(c * 100) / 100).toString();
  return `${s}%`;
}

/* ---------- Buttons ---------- */

btnShow?.addEventListener("click", () => {
  const rows = getRewardsForSelected();
  renderRewards(rows);
});

btnClear?.addEventListener("click", () => {
  selectedRelics = ["", "", "", ""];
  rebuildRelicSelectLabels();
  elCards.innerHTML = "";
  setStatus("Cleared");
});

/* ---------- Modal: Open from selects ---------- */

function openModalForSlot(slotIndex) {
  modalOpen = true;
  modalSlotIndex = slotIndex;
  modalMode = "relics";
  modalFilter = "all";
  modalQuery = "";

  elModal.classList.add("open");
  elModalSearch.value = "";
  updateModalUI();
  renderModalList();
}

sel1?.addEventListener("click", () => openModalForSlot(0));
sel2?.addEventListener("click", () => openModalForSlot(1));
sel3?.addEventListener("click", () => openModalForSlot(2));
sel4?.addEventListener("click", () => openModalForSlot(3));

elModalClose?.addEventListener("click", closeModal);
elModal?.addEventListener("click", (e) => {
  if (e.target === elModal) closeModal();
});

function closeModal() {
  modalOpen = false;
  elModal.classList.remove("open");
}

/* ---------- Modal: Mode Buttons ---------- */

elModalModeRelics?.addEventListener("click", () => {
  modalMode = "relics";
  modalQuery = "";
  elModalSearch.value = "";
  updateModalUI();
  renderModalList();
});

elModalModeItems?.addEventListener("click", () => {
  modalMode = "items";
  modalQuery = "";
  elModalSearch.value = "";
  updateModalUI();
  renderModalList();
});

/* ---------- Modal: Filters (Relics only) ---------- */

elModalFilterAll?.addEventListener("click", () => {
  modalFilter = "all";
  updateModalUI();
  renderModalList();
});
elModalFilterAvail?.addEventListener("click", () => {
  modalFilter = "available";
  updateModalUI();
  renderModalList();
});
elModalFilterVault?.addEventListener("click", () => {
  modalFilter = "vaulted";
  updateModalUI();
  renderModalList();
});

elModalSearch?.addEventListener("input", () => {
  modalQuery = elModalSearch.value || "";
  renderModalList();
});

/* ---------- Modal: Rendering ---------- */

function updateModalUI() {
  if (!modalOpen) return;

  // Title
  elModalTitle.textContent = "Choose relic";

  // Mode pills
  elModalModeRelics.classList.toggle("active", modalMode === "relics");
  elModalModeItems.classList.toggle("active", modalMode === "items");

  // Show/hide filter row in items mode
  if (modalMode === "items") {
    elModalFiltersRow.style.display = "none";
  } else {
    elModalFiltersRow.style.display = "";
  }

  // Filter pills
  elModalFilterAll.classList.toggle("active", modalFilter === "all");
  elModalFilterAvail.classList.toggle("active", modalFilter === "available");
  elModalFilterVault.classList.toggle("active", modalFilter === "vaulted");

  // Hint text
  if (modalMode === "items") {
    elModalHint.textContent = "";
  } else {
    if (modalFilter === "available") {
      const c = countVaultBy(true);
      elModalHint.textContent = `Showing unvaulted only • Available: ${c}`;
    } else if (modalFilter === "vaulted") {
      const c = countVaultBy(false);
      elModalHint.textContent = `Showing vaulted only • Vaulted: ${c}`;
    } else {
      const a = countVaultBy(true);
      const v = countVaultBy(false);
      elModalHint.textContent = `Available: ${a} • Vaulted: ${v}`;
    }
  }
}

function countVaultBy(isAvail) {
  if (!VAULT_STATUS || !VAULT_STATUS.available) return 0;
  let n = 0;
  for (const k of Object.keys(VAULT_STATUS.available)) {
    if (VAULT_STATUS.available[k] === isAvail) n++;
  }
  return n;
}

function renderModalList() {
  if (!modalOpen) return;

  if (modalMode === "relics") {
    renderRelicList();
    return;
  }

  renderItemsList();
}

function renderRelicList() {
  const relics = getRelicsArray().map(r => r.name);

  // filter by all/available/vaulted
  let list = relics.slice();

  if (modalFilter === "available") {
    list = list.filter(name => relicIsAvailable(name) === true);
  } else if (modalFilter === "vaulted") {
    list = list.filter(name => relicIsAvailable(name) === false);
  }

  // search
  const q = norm(modalQuery).toLowerCase();
  if (q) {
    list = list.filter(name => name.toLowerCase().includes(q));
  }

  // sort
  list.sort((a, b) => {
    const ka = relic_sort_key(a);
    const kb = relic_sort_key(b);
    return ka[0].localeCompare(kb[0]) || ka[1].localeCompare(kb[1]) || (ka[2] - kb[2]);
  });

  elModalList.innerHTML = list.map(name => {
    const dot = relicDotHtml(name);
    return `
      <div class="modalRow" data-pick="${escapeHtml(name)}">
        <div class="modalMain">${escapeHtml(name)}</div>
        <div class="modalSide">${dot}</div>
        <div class="modalSub">Tap to select</div>
      </div>
    `;
  }).join("");

  // click
  elModalList.querySelectorAll(".modalRow").forEach(row => {
    row.addEventListener("click", () => {
      const picked = row.getAttribute("data-pick");
      pickRelic(picked);
    });
  });
}

function pickRelic(name) {
  selectedRelics[modalSlotIndex] = name;
  rebuildRelicSelectLabels();
  closeModal();
}

function buildItemIndex() {
  // Build once (name -> {price, relics:[{relicName}]})
  // We do it lazily and cache in window.
  if (window.ITEM_INDEX) return window.ITEM_INDEX;

  const idx = new Map();
  const relics = getRelicsArray();

  for (const r of relics) {
    const rname = r.name;
    if (!Array.isArray(r.rewards)) continue;

    for (const rw of r.rewards) {
      const item = rw.item;
      if (!idx.has(item)) idx.set(item, { item, relics: [] });
      idx.get(item).relics.push({ relicName: rname });
    }
  }

  // add prices
  for (const [k, v] of idx.entries()) {
    v.price = getPrice(k);
  }

  window.ITEM_INDEX = idx;
  return idx;
}

function renderItemsList() {
  const idx = buildItemIndex();

  const q = norm(modalQuery).toLowerCase();
  let items = Array.from(idx.values());

  if (q) {
    items = items.filter(x => x.item.toLowerCase().includes(q));
  }

  // sort by price desc, then name
  items.sort((a, b) => (b.price - a.price) || a.item.localeCompare(b.item));

  // limit visible (keep performance nice on mobile)
  const MAX_SHOW = 80;
  const show = items.slice(0, MAX_SHOW);

  elModalList.innerHTML = show.map(info => {
    const priceText = info.price > 0 ? `${Math.round(info.price)} Plat` : "";
    const side = priceText ? `<div class="modalSide">${escapeHtml(priceText)}</div>` : `<div class="modalSide"></div>`;

    // ✅ CHANGE: build relic preview as colored spans (same as rewards list)
    const relicPreviewHtml = info.relics.slice(0, 10).map(e => formatRelicNameSpan(e.relicName)).join(" • ");

    return `
      <div class="modalRow" data-item="${escapeHtml(info.item)}">
        <div class="modalMain">${escapeHtml(info.item)}</div>
        ${side}
        <div class="modalSub">${relicPreviewHtml}${info.relics.length > 10 ? " …" : ""}</div>
      </div>
    `;
  }).join("");

  // click item -> open item detail view
  elModalList.querySelectorAll(".modalRow").forEach(row => {
    row.addEventListener("click", () => {
      const itemName = row.getAttribute("data-item");
      openItemDetail(itemName);
    });
  });
}

/* ---------- Item Detail View ---------- */

function openItemDetail(itemName) {
  // Replace list with detailed view showing all relics and allow pick
  const idx = buildItemIndex();
  const info = idx.get(itemName);
  if (!info) return;

  // sort relics nicely
  const relics = info.relics.map(x => x.relicName).sort((a, b) => {
    const ka = relic_sort_key(a);
    const kb = relic_sort_key(b);
    return ka[0].localeCompare(kb[0]) || ka[1].localeCompare(kb[1]) || (ka[2] - kb[2]);
  });

  const priceText = info.price > 0 ? `${Math.round(info.price)} Plat` : "—";
  elModalTitle.textContent = "Choose relic";

  // header
  elModalList.innerHTML = `
    <div class="itemDetailHeader">
      <div class="itemDetailTitle">${escapeHtml(itemName)}</div>
      <div class="itemDetailPrice">${escapeHtml(priceText)}</div>
      <div class="itemDetailSub">Select which relic to pick</div>
    </div>
    <div class="divider"></div>
    ${relics.map(rn => {
      const relicHtml = formatRelicNameSpan(rn);
      const dot = relicDotHtml(rn);
      return `
        <div class="modalRow" data-pick="${escapeHtml(rn)}">
          <div class="modalMain"><strong>${relicHtml}</strong></div>
          <div class="modalSide">${dot}</div>
          <div class="modalSub">Tap to select</div>
        </div>
      `;
    }).join("")}
  `;

  // click pick
  elModalList.querySelectorAll(".modalRow").forEach(row => {
    row.addEventListener("click", () => {
      const picked = row.getAttribute("data-pick");
      pickRelic(picked);
    });
  });
}

/* ---------- Init ---------- */

loadAll().catch(err => {
  console.error(err);
  setStatus("Error loading data. Check console.");
});
