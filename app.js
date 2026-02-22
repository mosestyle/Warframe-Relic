// Universal app.js: supports BOTH UI styles:
// 1) Old UI: <input id="r1"> ... <datalist id="relicsList">
// 2) Modal UI: buttons with <span id="r1Text"> + #modal picker
// Supports BOTH result styles:
// - Cards: <div id="cards">
// - Table: <tbody id="rows">

let RELICS = [];
let PRICES = {};
let RELIC_NAMES = [];

// For modal picker UI (if present)
const state = { r1: null, r2: null, r3: null, r4: null };

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
  if (typeof r === "number") return ["Common", "Uncommon", "Rare"][r] ?? String(r);
  const s = String(r ?? "").toLowerCase();
  if (s.includes("rare")) return "Rare";
  if (s.includes("uncommon")) return "Uncommon";
  if (s.includes("common")) return "Common";
  return String(r ?? "");
}

function platForItem(itemName) {
  const v = PRICES[itemName];
  return (typeof v === "number") ? v : null;
}

function pickSelectedRelicNames() {
  // Works for BOTH UI styles:
  // - Modal UI -> reads from r1Text/r2Text...
  // - Old UI -> reads from input values r1/r2...

  const picks = [];

  // Modal UI (if exists)
  ["r1Text", "r2Text", "r3Text", "r4Text"].forEach(id => {
    const el = $(id);
    if (el) {
      const t = norm(el.textContent);
      if (t && !t.toLowerCase().includes("tap to choose")) picks.push(t);
    }
  });

  // Old UI inputs (if exists)
  ["r1", "r2", "r3", "r4"].forEach(id => {
    const el = $(id);
    if (el && "value" in el) {
      const t = norm(el.value);
      if (t) picks.push(t);
    }
  });

  // If modal UI state is set but text isn’t present (rare), include state too
  ["r1", "r2", "r3", "r4"].forEach(k => {
    if (state[k]) picks.push(state[k]);
  });

  // Deduplicate
  return [...new Set(picks)];
}

function findRelicsByNames(names) {
  // Exact match first
  const exact = names
    .map(n => RELICS.find(r => relicDisplayName(r) === n))
    .filter(Boolean);

  if (exact.length) return exact;

  // Fallback: case-insensitive match
  const lowerMap = new Map(RELICS.map(r => [relicDisplayName(r).toLowerCase(), r]));
  const fallback = names
    .map(n => lowerMap.get(n.toLowerCase()))
    .filter(Boolean);

  return fallback;
}

function mergeAndSortRewards(relicsPicked) {
  // Collect drops
  const all = [];
  for (const r of relicsPicked) {
    const drops = r.drops ?? r.rewards ?? [];
    for (const d of drops) {
      const item = d.item ?? d.name ?? d.reward ?? "Unknown";
      const rarity = rarityToLabel(d.rarity ?? d.tier ?? d.chance ?? "");
      const plat = platForItem(item);
      all.push({
        item,
        from: relicDisplayName(r),
        rarity,
        plat: plat ?? -1
      });
    }
  }

  // Merge duplicates by item name
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

  // Sort: highest plat first, unknown last (-1)
  final.sort((a, b) => b.plat - a.plat);

  return final;
}

// ---- Renderers (cards OR table) ----

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

function showRewardsForSelectedRelics() {
  const picks = pickSelectedRelicNames();

  if (picks.length === 0) {
    setStatus("Pick at least 1 relic");
    return;
  }

  const relicsPicked = findRelicsByNames(picks);

  if (relicsPicked.length === 0) {
    setStatus("Could not match relic names. Re-select the relics.");
    return;
  }

  const rewards = mergeAndSortRewards(relicsPicked);

  // Render cards if available, else table
  const rendered = renderCards(rewards) || renderTable(rewards);

  if (!rendered) {
    setStatus("UI error: No results container found (#cards or #rows).");
    return;
  }

  setStatus(`Showing ${rewards.length} unique rewards`);
}

// ---- Modal picker support (only if modal exists on the page) ----

let modalTarget = null;

function openModal(targetKey) {
  const modal = $("modal");
  const modalTitle = $("modalTitle");
  const modalSearch = $("modalSearch");
  if (!modal || !modalTitle || !modalSearch) return;

  modalTarget = targetKey;
  modal.classList.remove("hidden");
  modalTitle.textContent = `Choose relic (${targetKey.toUpperCase()})`;
  modalSearch.value = "";
  renderModalList("");
  setTimeout(() => modalSearch.focus(), 50);
}

function closeModal() {
  const modal = $("modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modalTarget = null;
}

function renderModalList(filter) {
  const modalList = $("modalList");
  if (!modalList) return;

  const q = (filter || "").trim().toLowerCase();
  modalList.innerHTML = "";

  const list = q
    ? RELIC_NAMES.filter(n => n.toLowerCase().includes(q)).slice(0, 600)
    : RELIC_NAMES.slice(0, 600);

  for (const name of list) {
    const item = document.createElement("div");
    item.className = "modalItem";
    item.innerHTML = `<strong>${name}</strong><span>Tap to select</span>`;
    item.addEventListener("click", () => {
      if (!modalTarget) return;

      state[modalTarget] = name;

      const tEl = $(`${modalTarget}Text`);
      if (tEl) {
        tEl.textContent = name;
        tEl.classList.remove("pickerPlaceholder");
      }

      closeModal();
    });
    modalList.appendChild(item);
  }
}

function bindModalUIIfPresent() {
  // If these exist, bind them. If not, no problem.
  const closeBtn = $("modalClose");
  const modalSearch = $("modalSearch");

  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (modalSearch) modalSearch.addEventListener("input", () => renderModalList(modalSearch.value));

  // Bind picker buttons (modal UI)
  document.querySelectorAll(".pickerBtn").forEach(btn => {
    btn.addEventListener("click", () => openModal(btn.dataset.target));
  });
}

// ---- Old datalist support (only if present) ----

function populateDatalistIfPresent() {
  const dl = $("relicsList");
  if (!dl) return;

  dl.innerHTML = "";
  for (const n of RELIC_NAMES) {
    const opt = document.createElement("option");
    opt.value = n;
    dl.appendChild(opt);
  }
}

// ---- Boot ----

async function boot() {
  setStatus("Loading data…");

  const [relicRes, priceRes] = await Promise.all([
    fetch("./data/Relics.min.json", { cache: "no-store" }),
    fetch("./data/prices.json", { cache: "no-store" })
  ]);

  RELICS = await relicRes.json();
  PRICES = await priceRes.json();

  RELIC_NAMES = RELICS.map(relicDisplayName).sort((a, b) => a.localeCompare(b));

  populateDatalistIfPresent();
  bindModalUIIfPresent();

  const footer = $("footer");
  if (footer) {
    footer.textContent = `Relics: ${RELICS.length} • Price entries: ${Object.keys(PRICES).length}`;
  }

  setStatus("Ready");
}

document.addEventListener("DOMContentLoaded", () => {
  const showBtn = $("btnShow");
  const clearBtn = $("btnClear");

  if (showBtn) showBtn.addEventListener("click", showRewardsForSelectedRelics);

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      // Clear old inputs if present
      ["r1", "r2", "r3", "r4"].forEach(id => {
        const el = $(id);
        if (el && "value" in el) el.value = "";
      });

      // Clear modal texts if present
      ["r1", "r2", "r3", "r4"].forEach(k => {
        state[k] = null;
        const tEl = $(`${k}Text`);
        if (tEl) {
          tEl.textContent = "Tap to choose";
          tEl.classList.add("pickerPlaceholder");
        }
      });

      // Clear results
      const cards = $("cards");
      if (cards) cards.innerHTML = "";
      const rows = $("rows");
      if (rows) rows.innerHTML = "";

      setStatus("Cleared");
    });
  }

  boot().catch(err => {
    console.error(err);
    setStatus("Failed to load data (run GitHub Action once)");
  });
});
