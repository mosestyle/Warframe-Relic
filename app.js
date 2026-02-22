let RELICS = [];
let PRICES = {};
let RELIC_NAMES = [];

const state = { r1: null, r2: null, r3: null, r4: null };

function relicDisplayName(relicObj){
  const era = relicObj.era ?? relicObj.tier ?? "";
  const name = relicObj.name ?? relicObj.relicName ?? relicObj.code ?? "";
  return `${era} ${name}`.trim().replace(/\s+/g, " ");
}

function setStatus(msg){ document.getElementById("status").textContent = msg || ""; }

function platForItem(itemName){
  const v = PRICES[itemName];
  return (typeof v === "number") ? v : null;
}

function rarityToLabel(r){
  if (typeof r === "number") return ["Common","Uncommon","Rare"][r] ?? String(r);
  const s = String(r).toLowerCase();
  if (s.includes("common")) return "Common";
  if (s.includes("uncommon")) return "Uncommon";
  if (s.includes("rare")) return "Rare";
  return String(r);
}

function renderCards(relicsPicked){
  const cardsEl = document.getElementById("cards");
  cardsEl.innerHTML = "";

  const all = [];
  for (const r of relicsPicked){
    const drops = r.drops ?? [];
    for (const d of drops){
      const item = d.item ?? "Unknown";
      const rarity = rarityToLabel(d.rarity ?? "");
      const plat = platForItem(item);
      all.push({ item, from: relicDisplayName(r), rarity, plat: plat ?? -1 });
    }
  }

  // Merge duplicates
  const merged = new Map();
  for (const e of all){
    const prev = merged.get(e.item);
    if (!prev){
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

  final.sort((a,b) => b.plat - a.plat);

  for (const e of final){
    const div = document.createElement("div");
    div.className = "cardRow";
    div.innerHTML = `
      <div class="cardLeft">
        <div class="itemName">${e.item}</div>
        <div class="itemMeta">
          <span class="badge">${e.rarity}</span>
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

  setStatus(`Showing ${final.length} unique rewards`);
}

// -------- Modal picker ----------
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalSearch = document.getElementById("modalSearch");
const modalList = document.getElementById("modalList");
let modalTarget = null;

function openModal(targetKey){
  modalTarget = targetKey;
  modal.classList.remove("hidden");
  modalTitle.textContent = `Choose relic (${targetKey.toUpperCase()})`;
  modalSearch.value = "";
  renderModalList("");
  setTimeout(() => modalSearch.focus(), 50);
}

function closeModal(){
  modal.classList.add("hidden");
  modalTarget = null;
}

function renderModalList(filter){
  const q = (filter || "").trim().toLowerCase();
  modalList.innerHTML = "";

  const list = q
    ? RELIC_NAMES.filter(n => n.toLowerCase().includes(q)).slice(0, 400)
    : RELIC_NAMES.slice(0, 400);

  for (const name of list){
    const item = document.createElement("div");
    item.className = "modalItem";
    item.innerHTML = `<strong>${name}</strong><span>Tap to select</span>`;
    item.addEventListener("click", () => {
      state[modalTarget] = name;
      document.getElementById(`${modalTarget}Text`).textContent = name;
      document.getElementById(`${modalTarget}Text`).classList.remove("pickerPlaceholder");
      closeModal();
    });
    modalList.appendChild(item);
  }
}

document.getElementById("modalClose").addEventListener("click", closeModal);
modalSearch.addEventListener("input", () => renderModalList(modalSearch.value));

// Bind the 4 picker buttons
document.querySelectorAll(".pickerBtn").forEach(btn => {
  btn.addEventListener("click", () => openModal(btn.dataset.target));
});

// -------- Boot ----------
async function boot(){
  setStatus("Loading data…");

  const [relicRes, priceRes] = await Promise.all([
    fetch("./data/Relics.min.json", { cache: "no-store" }),
    fetch("./data/prices.json", { cache: "no-store" })
  ]);

  RELICS = await relicRes.json();
  PRICES = await priceRes.json();

  RELIC_NAMES = RELICS.map(relicDisplayName).sort((a,b)=>a.localeCompare(b));

  document.getElementById("footer").textContent =
    `Relics: ${RELICS.length} • Price entries: ${Object.keys(PRICES).length}`;

  setStatus("Ready");
}

document.getElementById("btnShow").addEventListener("click", () => {
  const picks = [state.r1, state.r2, state.r3, state.r4].filter(Boolean);
  if (picks.length === 0){
    setStatus("Pick at least 1 relic");
    return;
  }

  const relicsPicked = picks
    .map(name => RELICS.find(r => relicDisplayName(r) === name))
    .filter(Boolean);

  renderCards(relicsPicked);
});

document.getElementById("btnClear").addEventListener("click", () => {
  state.r1 = state.r2 = state.r3 = state.r4 = null;
  ["r1","r2","r3","r4"].forEach(k => {
    const el = document.getElementById(`${k}Text`);
    el.textContent = "Tap to choose";
    el.classList.add("pickerPlaceholder");
  });
  document.getElementById("cards").innerHTML = "";
  setStatus("Cleared");
});

boot().catch(err => {
  console.error(err);
  setStatus("Failed to load data (run GitHub Action once)");
});