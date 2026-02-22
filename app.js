// app.js — Modal picker UI + prices from data/prices.json ONLY.
// No caching, no client-side price fetching.

let RELICS = [];
let PRICES = {};
let RELIC_NAMES = [];
let META = null;

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

function rarityToLabel(r) {
  // Your UI was showing numbers like 0.25 — keep that
  if (typeof r === "number") return String(r);
  return String(r ?? "");
}

// ---------------- Natural relic sort (A1, A2, ... A10) ----------------
const ERA_ORDER = { Lith: 0, Meso: 1, Neo: 2, Axi: 3 };

function parseRelicName(str) {
  const s = (str || "").trim().replace(/\s+/g, " ");
  const m = s.match(/^(\w+)\s+([A-Za-z]+)(\d+)([A-Za-z]*)$/);
  if (!m) return { era: "", letters: s, num: 0, tail: "" };
  return {
    era: m[1],
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

// ---------------- Modal picker ----------------
let modalTarget = null;

function openModal(targetKey) {
  const modal = $("modal");
  if (!modal) return;

  modalTarget = targetKey;

  const title = $("modalTitle");
  if (title) title.textContent = "Choose relic";

  const search = $("modalSearch");
  if (search) search.value = "";

  renderModalList("");

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

function updateFooter() {
  const footer = $("footer");
  if (!footer) return;

  const left = `Relics: ${RELICS.length} • Price entries: ${Object.keys(PRICES).length}`;
  const right = META?.generated_at ? `Last generated: ${META.generated_at}` : "";

  // IMPORTANT: don't touch CSS. Just make footer render on one row via inline style.
  footer.style.display = "flex";
  footer.style.justifyContent = "space-between";
  footer.style.gap = "12px";

  footer.innerHTML = `<span>${left}</span><span>${right}</span>`;
}

// ---------------- Boot ----------------
async function boot() {
  setStatus("Loading…");

  // Load relics + prices generated by the workflow
  const relicRes = await fetch("./data/Relics.min.json", { cache: "no-store" });
  RELICS = await relicRes.json();

  // If prices.json is empty/missing, PRICES becomes {}
  try {
    const priceRes = await fetch("./data/prices.json", { cache: "no-store" });
    PRICES = await priceRes.json();
  } catch {
    PRICES = {};
  }

  // Load meta.json (optional)
  try {
    const metaRes = await fetch("./data/meta.json", { cache: "no-store" });
    META = await metaRes.json();
  } catch {
    META = null;
  }

  // Use natural sort so A1, A2, ... A10
  RELIC_NAMES = RELICS.map(relicDisplayName).sort(relicNaturalCompare);

  updateFooter();

  // Bind modal UI
  $("modalClose")?.addEventListener("click", closeModal);
  $("modalSearch")?.addEventListener("input", (e) => renderModalList(e.target.value));

  document.querySelectorAll(".pickerBtn").forEach(btn => {
    btn.addEventListener("click", () => openModal(btn.dataset.target));
  });

  // Buttons
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
