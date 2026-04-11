// app.js — Modal picker UI + prices from data/prices.json ONLY.

let RELICS = [];
let PRICES = {};
let RELIC_NAMES = [];
let VAULT = null;

const state = { r1: null, r2: null, r3: null, r4: null };
const PICKER_DEFAULT = "Tap to choose (Lith/Meso/Neo/Axi)";

const $ = (id) => document.getElementById(id);

// Save/restore scroll position for Items list
let ITEM_LIST_SCROLL_TOP = 0;

// scanner instance
let REWARD_SCANNER = null;

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

// ---------------- Vault helpers ----------------
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function relicIsAvailable(relicName) {
  if (!VAULT || !relicName) return null;

  if (VAULT.available && typeof VAULT.available === "object") {
    const v = VAULT.available[relicName];
    if (typeof v === "boolean") return v;
  }

  const v = VAULT[relicName];
  if (typeof v === "boolean") return v;
  if (v && typeof v === "object") {
    if (typeof v.available === "boolean") return v.available;
    if (typeof v.vaulted === "boolean") return !v.vaulted;
  }

  return null;
}

function relicDotHtml(relicName) {
  const clean = (relicName || "").trim();
  const avail = relicIsAvailable(clean);
  const cls =
    avail === true ? "relicDot available" :
    avail === false ? "relicDot vaulted" :
    "relicDot unknown";
  return `<span class="${cls}" aria-hidden="true"></span>`;
}

function formatRelicNameSpan(relicName) {
  const clean = (relicName || "").trim();
  const avail = relicIsAvailable(clean);
  const cls =
    avail === true ? "relicName available" :
    avail === false ? "relicName vaulted" :
    "relicName";
  return `<span class="${cls}">${escapeHtml(clean)}</span>`;
}

function formatFromRelicsHtml(fromStr) {
  const s = String(fromStr ?? "").trim();
  if (!s) return "";

  const parts = s.split(",").map(x => x.trim()).filter(Boolean);
  if (parts.length === 0) return escapeHtml(s);

  return parts.map(p => formatRelicNameSpan(p)).join(", ");
}

// ---------------- Relics filter ----------------
let RELIC_FILTER_MODE = "all";

function countVaultStates() {
  let available = 0, vaulted = 0, unknown = 0;
  for (const name of RELIC_NAMES) {
    const v = relicIsAvailable(name);
    if (v === true) available++;
    else if (v === false) vaulted++;
    else unknown++;
  }
  return { available, vaulted, unknown, total: RELIC_NAMES.length };
}

function setRelicFilterMode(mode) {
  RELIC_FILTER_MODE = (mode === "available" || mode === "vaulted") ? mode : "all";

  $("rfAll")?.classList.toggle("active", RELIC_FILTER_MODE === "all");
  $("rfAvail")?.classList.toggle("active", RELIC_FILTER_MODE === "available");
  $("rfVault")?.classList.toggle("active", RELIC_FILTER_MODE === "vaulted");

  const hint = $("vaultHint");
  if (hint) {
    const counts = countVaultStates();
    if (RELIC_FILTER_MODE === "available") {
      hint.textContent = `Showing unvaulted only (${counts.available})`;
    } else if (RELIC_FILTER_MODE === "vaulted") {
      hint.textContent = `Showing vaulted only (${counts.vaulted})`;
    } else {
      hint.textContent = `Available: ${counts.available} • Vaulted: ${counts.vaulted}`;
    }
  }

  if (SEARCH_MODE === "relic") {
    renderModalList($("modalSearch")?.value || "");
  }
}

function relicPassesFilter(relicName) {
  if (RELIC_FILTER_MODE === "all") return true;

  const avail = relicIsAvailable(relicName);
  if (avail === null) return false;

  return (RELIC_FILTER_MODE === "available") ? (avail === true) : (avail === false);
}

// ---------------- Item -> relic index ----------------
let ITEM_TO_RELICS = null;

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
    info.plat = platForItem(info.displayName);
  }

  ITEM_TO_RELICS = map;
}

// scanner helpers
function getKnownItemNames() {
  const relicItems = ITEM_TO_RELICS
    ? [...ITEM_TO_RELICS.values()].map(info => info.displayName).filter(Boolean)
    : [];

  const priceItems = Object.keys(PRICES || {}).filter(Boolean);

  return [...new Set([...relicItems, ...priceItems])]
    .sort((a, b) => a.localeCompare(b));
}

function initRewardScanner() {
  if (typeof window.createRewardScanner !== "function") return;

  REWARD_SCANNER = window.createRewardScanner({
    fileInputId: "scanFileInput",
    uploadBtnId: "scanUploadBtn",
    clearBtnId: "scanClearBtn",
    statusId: "scanStatus",
    previewWrapId: "scanPreviewWrap",
    previewImgId: "scanPreview",
    resultsId: "scanResults",
    debugWrapId: "scanDebugWrap",
    debugTextId: "scanDebugText",
    debugActionsId: "scanDebugActions",
    copyDebugBtnId: "scanCopyDebugBtn"
  });

  REWARD_SCANNER.setData(getKnownItemNames(), PRICES);
}

// ---------------- Modal picker + modes ----------------
let modalTarget = null;
let SEARCH_MODE = "relic";
let ITEM_DETAIL = null;

// Items mode controls
let ITEM_TOP_MODE = false;
let ITEM_FILTER_MODE = "all";

function setButtonsActive() {
  $("modeRelics")?.classList.toggle("active", SEARCH_MODE === "relic");
  $("modeItems")?.classList.toggle("active", SEARCH_MODE === "items");
}

function showRelicControls() {
  $("relicFilterRow")?.classList.remove("hidden");
  $("itemFilterRow")?.classList.add("hidden");
}

function showItemControls() {
  $("relicFilterRow")?.classList.add("hidden");
  $("itemFilterRow")?.classList.remove("hidden");
}

function updateItemHint(totalMatches = null) {
  const hint = $("itemHint");
  if (!hint) return;

  if (!ITEM_TOP_MODE) {
    hint.textContent = "Type an item name to see which relics contain it.";
    return;
  }

  const label =
    ITEM_FILTER_MODE === "available" ? "Available only" :
    ITEM_FILTER_MODE === "vaulted" ? "Vaulted only" :
    "All items";

  if (typeof totalMatches === "number") {
    hint.textContent = `${label} • sorted by platinum highest to lowest • showing top ${Math.min(totalMatches, 500)}`;
  } else {
    hint.textContent = `${label} • sorted by platinum highest to lowest • showing top 500`;
  }
}

function setItemTopMode(enabled) {
  ITEM_TOP_MODE = !!enabled;

  $("itemTopToggle")?.classList.toggle("active", ITEM_TOP_MODE);
  $("itemSegWrap")?.classList.toggle("hidden", !ITEM_TOP_MODE);

  if (!ITEM_TOP_MODE) {
    setItemFilterMode("all", false);
  }

  ITEM_DETAIL = null;
  ITEM_LIST_SCROLL_TOP = 0;

  updateItemHint();
  if (SEARCH_MODE === "items") {
    renderModalList($("modalSearch")?.value || "");
  }
}

function setItemFilterMode(mode, rerender = true) {
  ITEM_FILTER_MODE = (mode === "available" || mode === "vaulted") ? mode : "all";

  $("ifAll")?.classList.toggle("active", ITEM_FILTER_MODE === "all");
  $("ifAvail")?.classList.toggle("active", ITEM_FILTER_MODE === "available");
  $("ifVault")?.classList.toggle("active", ITEM_FILTER_MODE === "vaulted");

  ITEM_DETAIL = null;
  ITEM_LIST_SCROLL_TOP = 0;

  updateItemHint();
  if (rerender && SEARCH_MODE === "items") {
    renderModalList($("modalSearch")?.value || "");
  }
}

function setSearchMode(mode) {
  SEARCH_MODE = (mode === "items") ? "items" : "relic";
  ITEM_DETAIL = null;

  setButtonsActive();

  const search = $("modalSearch");
  if (search) {
    search.value = "";
    search.placeholder =
      (SEARCH_MODE === "items")
        ? "Search item: e.g. Wisp Prime Chassis Blueprint"
        : "Search: e.g. Meso C1 / Neo N16 / Axi S18";
  }

  if (SEARCH_MODE === "items") {
    showItemControls();
    updateItemHint();
  } else {
    showRelicControls();
    setRelicFilterMode("all");
  }

  ITEM_LIST_SCROLL_TOP = 0;
  renderModalList("");
}

function openModal(targetKey) {
  const modal = $("modal");
  if (!modal) return;

  modalTarget = targetKey;

  const title = $("modalTitle");
  if (title) title.textContent = "Choose relic";

  ITEM_DETAIL = null;
  ITEM_TOP_MODE = false;
  ITEM_FILTER_MODE = "all";
  ITEM_LIST_SCROLL_TOP = 0;

  $("itemTopToggle")?.classList.remove("active");
  $("itemSegWrap")?.classList.add("hidden");
  $("ifAll")?.classList.add("active");
  $("ifAvail")?.classList.remove("active");
  $("ifVault")?.classList.remove("active");

  setSearchMode("relic");

  modal.classList.remove("hidden");
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

// ---------------- Items helpers ----------------
function itemRelicsForFilter(info) {
  const relics = Array.isArray(info?.relics) ? info.relics : [];
  if (!ITEM_TOP_MODE || ITEM_FILTER_MODE === "all") return relics;

  return relics.filter(e => {
    const avail = relicIsAvailable(e.relicName);
    if (avail === null) return false;
    return ITEM_FILTER_MODE === "available" ? avail === true : avail === false;
  });
}

function itemPassesTopFilter(info) {
  if (!ITEM_TOP_MODE) return true;
  return itemRelicsForFilter(info).length > 0;
}

function itemSortByPlatThenName(a, b) {
  const ap = (typeof a.plat === "number") ? a.plat : -1;
  const bp = (typeof b.plat === "number") ? b.plat : -1;
  if (bp !== ap) return bp - ap;
  return a.displayName.localeCompare(b.displayName);
}

// ---------------- Detail view ----------------
function renderItemDetailView() {
  const listEl = $("modalList");
  if (!listEl || !ITEM_DETAIL) return;

  listEl.innerHTML = "";
  listEl.scrollTop = 0;

  const back = document.createElement("div");
  back.className = "modalItem";
  back.innerHTML = `
    <div class="modalBack"><strong>← Back</strong></div>
    <span>Back to item results</span>
  `;
  back.addEventListener("click", () => {
    ITEM_DETAIL = null;
    renderModalList($("modalSearch")?.value || "", { restoreItemScroll: true });
  });
  listEl.appendChild(back);

  const header = document.createElement("div");
  header.className = "modalItem";
  header.innerHTML = `
    <div class="modalRowTop">
      <strong>${escapeHtml(ITEM_DETAIL.displayName)}</strong>
      <span class="modalPrice">${typeof ITEM_DETAIL.plat === "number" ? `${ITEM_DETAIL.plat} Plat` : "?"}</span>
    </div>
    <span>Select which relic to pick</span>
  `;
  listEl.appendChild(header);

  const relicsToShow = itemRelicsForFilter(ITEM_DETAIL);

  if (relicsToShow.length === 0) {
    const row = document.createElement("div");
    row.className = "modalItem";
    row.innerHTML = `<strong>No relics in this filter</strong><span>Try All, Available, or Vaulted</span>`;
    listEl.appendChild(row);
    return;
  }

  for (const e of relicsToShow.slice(0, 250)) {
    const row = document.createElement("div");
    row.className = "modalItem";
    row.innerHTML = `
      <div class="modalRowTop">
        <strong>${formatRelicNameSpan(e.relicName)}</strong>
        ${relicDotHtml(e.relicName)}
      </div>
      <span>${escapeHtml(e.rarityLabel || "Tap to select")}</span>
    `;
    row.addEventListener("click", () => pickRelic(e.relicName));
    listEl.appendChild(row);
  }
}

// ---------------- Main modal render ----------------
function renderModalList(filter, options = {}) {
  const listEl = $("modalList");
  if (!listEl) return;

  if (SEARCH_MODE === "items" && ITEM_DETAIL) {
    renderItemDetailView();
    return;
  }

  const q = (filter || "").toLowerCase().trim();
  listEl.innerHTML = "";

  if (SEARCH_MODE === "items") {
    if (!ITEM_TO_RELICS) buildItemIndex();

    const allItems = [...ITEM_TO_RELICS.values()];

    if (ITEM_TOP_MODE) {
      let matches = allItems
        .filter(info => itemPassesTopFilter(info))
        .filter(info => !q || info.displayName.toLowerCase().includes(q));

      matches.sort(itemSortByPlatThenName);

      updateItemHint(matches.length);

      if (matches.length === 0) {
        const row = document.createElement("div");
        row.className = "modalItem";
        row.innerHTML = `<strong>No item match</strong><span>Try another search or change All / Available / Vaulted</span>`;
        listEl.appendChild(row);
        listEl.scrollTop = 0;
        return;
      }

      for (const info of matches.slice(0, 500)) {
        const previewRelics = itemRelicsForFilter(info);
        const relicPreview = previewRelics
          .slice(0, 10)
          .map(e => formatRelicNameSpan(e.relicName))
          .join(" • ");

        const priceText = (typeof info.plat === "number") ? `${info.plat} Plat` : "?";

        const row = document.createElement("div");
        row.className = "modalItem";
        row.innerHTML = `
          <div class="modalRowTop">
            <strong>${escapeHtml(info.displayName)}</strong>
            <span class="modalPrice">${priceText}</span>
          </div>
          <div class="modalSub">${relicPreview || "No matching relics"}${previewRelics.length > 10 ? " …" : ""}</div>
        `;
        row.addEventListener("click", () => {
          ITEM_LIST_SCROLL_TOP = listEl.scrollTop;
          ITEM_DETAIL = info;
          renderItemDetailView();
        });
        listEl.appendChild(row);
      }

      if (options.restoreItemScroll) {
        requestAnimationFrame(() => {
          listEl.scrollTop = ITEM_LIST_SCROLL_TOP;
        });
      } else {
        listEl.scrollTop = 0;
      }

      return;
    }

    updateItemHint();

    if (!q) {
      const row = document.createElement("div");
      row.className = "modalItem";
      row.innerHTML = `<strong>Type an item name</strong><span>Example: Wisp Prime Chassis Blueprint</span>`;
      listEl.appendChild(row);
      listEl.scrollTop = 0;
      return;
    }

    const matches = [];
    for (const info of allItems) {
      if (info.displayName.toLowerCase().includes(q)) matches.push(info);
      if (matches.length >= 200) break;
    }

    if (matches.length === 0) {
      const row = document.createElement("div");
      row.className = "modalItem";
      row.innerHTML = `<strong>No item match</strong><span>Try shorter (e.g. wisp neuroptics)</span>`;
      listEl.appendChild(row);
      listEl.scrollTop = 0;
      return;
    }

    matches.sort(itemSortByPlatThenName);

    for (const info of matches.slice(0, 20)) {
      const relicPreview = info.relics
        .slice(0, 10)
        .map(e => formatRelicNameSpan(e.relicName))
        .join(" • ");

      const priceText = (typeof info.plat === "number") ? `${info.plat} Plat` : "?";

      const row = document.createElement("div");
      row.className = "modalItem";
      row.innerHTML = `
        <div class="modalRowTop">
          <strong>${escapeHtml(info.displayName)}</strong>
          <span class="modalPrice">${priceText}</span>
        </div>
        <div class="modalSub">${relicPreview}${info.relics.length > 10 ? " …" : ""}</div>
      `;
      row.addEventListener("click", () => {
        ITEM_LIST_SCROLL_TOP = listEl.scrollTop;
        ITEM_DETAIL = info;
        renderItemDetailView();
      });
      listEl.appendChild(row);
    }

    if (options.restoreItemScroll) {
      requestAnimationFrame(() => {
        listEl.scrollTop = ITEM_LIST_SCROLL_TOP;
      });
    } else {
      listEl.scrollTop = 0;
    }

    return;
  }

  const base = q
    ? RELIC_NAMES.filter(n => n.toLowerCase().includes(q))
    : RELIC_NAMES;

  const list = base
    .filter(relicPassesFilter)
    .slice(0, 800);

  for (const name of list) {
    const row = document.createElement("div");
    row.className = "modalItem";
    row.innerHTML = `
      <div class="modalRowTop">
        <strong>${escapeHtml(name)}</strong>
        ${relicDotHtml(name)}
      </div>
      <span>Tap to select</span>
    `;
    row.addEventListener("click", () => pickRelic(name));
    listEl.appendChild(row);
  }

  listEl.scrollTop = 0;
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
        <div class="itemName">${escapeHtml(e.item)}</div>
        <div class="itemMeta">
          <span class="badge">${escapeHtml(e.rarity || "")}</span>
          <span>${formatFromRelicsHtml(e.from)}</span>
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

  try {
    const vaultRes = await fetch("./data/vaultStatus.json", { cache: "no-store" });
    VAULT = await vaultRes.json();
  } catch {
    VAULT = null;
  }

  RELIC_NAMES = RELICS.map(relicDisplayName).sort(relicNaturalCompare);

  buildItemIndex();
  initRewardScanner();

  const footer = $("footer");
  if (footer) footer.textContent = `Relics: ${RELICS.length} • Price entries: ${Object.keys(PRICES).length}`;

  $("modalClose")?.addEventListener("click", closeModal);

  $("modalSearch")?.addEventListener("input", (e) => {
    const val = e.target.value;
    if (SEARCH_MODE === "items" && ITEM_DETAIL) ITEM_DETAIL = null;
    ITEM_LIST_SCROLL_TOP = 0;
    renderModalList(val);
  });

  $("modeRelics")?.addEventListener("click", () => setSearchMode("relic"));
  $("modeItems")?.addEventListener("click", () => setSearchMode("items"));

  $("rfAll")?.addEventListener("click", () => setRelicFilterMode("all"));
  $("rfAvail")?.addEventListener("click", () => setRelicFilterMode("available"));
  $("rfVault")?.addEventListener("click", () => setRelicFilterMode("vaulted"));

  $("itemTopToggle")?.addEventListener("click", () => setItemTopMode(!ITEM_TOP_MODE));
  $("ifAll")?.addEventListener("click", () => setItemFilterMode("all"));
  $("ifAvail")?.addEventListener("click", () => setItemFilterMode("available"));
  $("ifVault")?.addEventListener("click", () => setItemFilterMode("vaulted"));

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

    if ($("cards")) $("cards").innerHTML = "";
    setStatus("Cleared");
  });

  showRelicControls();
  updateItemHint();

  setStatus("Ready");
}

document.addEventListener("DOMContentLoaded", () => {
  boot().catch(err => {
    console.error(err);
    setStatus("Failed to load data");
  });
});
