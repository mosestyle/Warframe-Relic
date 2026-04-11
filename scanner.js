(function () {
  const MEDALS = ["🥇", "🥈", "🥉", ""];

  function normalizeText(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[’'`´]/g, "")
      .replace(/([a-z])prime\b/g, "$1 prime")
      .replace(/[^a-z0-9+\s]/g, " ")
      .replace(/\bblueprlnt\b/g, "blueprint")
      .replace(/\bblueprints\b/g, "blueprint")
      .replace(/\bsysterns\b/g, "systems")
      .replace(/\bsystern\b/g, "system")
      .replace(/\bsytems\b/g, "systems")
      .replace(/\bneuroptlcs\b/g, "neuroptics")
      .replace(/\bneuropticss\b/g, "neuroptics")
      .replace(/\brecelver\b/g, "receiver")
      .replace(/\bchassls\b/g, "chassis")
      .replace(/\bassis\b/g, "chassis")
      .replace(/\bprlme\b/g, "prime")
      .replace(/\bpnme\b/g, "prime")
      .replace(/\bpor\b/g, "prime")
      .replace(/\basherime\b/g, "ash prime")
      .replace(/\bsaynprime\b/g, "saryn prime")
      .replace(/\bnovaprime\b/g, "nova prime")
      .replace(/\bcarrierprime\b/g, "carrier prime")
      .replace(/\bwakong\b/g, "wukong")
      .replace(/\bnukong\b/g, "wukong")
      .replace(/\bmirag\b/g, "mirage")
      .replace(/\bprifie\b/g, "prime")
      .replace(/\bdestreza prime h\b/g, "destreza prime handle")
      .replace(/\bdle forma blueprint\b/g, "forma blueprint")
      .replace(/\bforma bluepnint\b/g, "forma blueprint")
      .replace(/\blueprint\b/g, "blueprint")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    if (!m) return n;
    if (!n) return m;

    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }

    return dp[m][n];
  }

  function tokenOverlapScore(a, b) {
    const at = new Set(normalizeText(a).split(" ").filter(Boolean));
    const bt = new Set(normalizeText(b).split(" ").filter(Boolean));
    if (!at.size || !bt.size) return 0;

    let shared = 0;
    for (const t of at) {
      if (bt.has(t)) shared++;
    }
    return shared / Math.max(at.size, bt.size);
  }

  function stringScore(input, candidate) {
    const ai = normalizeText(input);
    const bi = normalizeText(candidate);

    if (!ai || !bi) return 0;
    if (ai === bi) return 1;

    const overlap = tokenOverlapScore(ai, bi);
    const lev = 1 - (levenshtein(ai, bi) / Math.max(ai.length, bi.length, 1));
    const containsBoost = (bi.includes(ai) || ai.includes(bi)) ? 0.08 : 0;

    return Math.max(0, Math.min(1, overlap * 0.60 + lev * 0.40 + containsBoost));
  }

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => resolve({ img, dataUrl: reader.result });
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function makeCanvas(w, h) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    return canvas;
  }

  function prepareCanvas(img) {
    const maxW = 2400;
    const scale = img.width > maxW ? (maxW / img.width) : 1;
    const canvas = makeCanvas(img.width * scale, img.height * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114);
      const boosted =
        gray > 180 ? 255 :
        gray < 70 ? 0 :
        Math.min(255, Math.max(0, gray * 1.15));

      data[i] = boosted;
      data[i + 1] = boosted;
      data[i + 2] = boosted;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  function cropCanvas(sourceCanvas, x, y, w, h) {
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    ctx.drawImage(
      sourceCanvas,
      Math.round(x),
      Math.round(y),
      Math.round(w),
      Math.round(h),
      0,
      0,
      canvas.width,
      canvas.height
    );

    return canvas;
  }

  function upscaleCanvas(sourceCanvas, factor = 2) {
    const canvas = makeCanvas(sourceCanvas.width * factor, sourceCanvas.height * factor);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function thresholdCanvas(sourceCanvas, lightCut = 155, darkCut = 85) {
    const canvas = makeCanvas(sourceCanvas.width, sourceCanvas.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(sourceCanvas, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114);
      let v = gray;
      if (gray >= lightCut) v = 255;
      else if (gray <= darkCut) v = 0;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  function getRewardBandCanvas(baseCanvas) {
    const w = baseCanvas.width;
    const h = baseCanvas.height;

    // safer / wider crop than the broken over-tight version
    const x = w * 0.17;
    const y = h * 0.22;
    const cw = w * 0.67;
    const ch = h * 0.34;

    return cropCanvas(baseCanvas, x, y, cw, ch);
  }

  function getSlotCanvases(rewardBandCanvas) {
    const slots = [];
    const fullW = rewardBandCanvas.width;
    const fullH = rewardBandCanvas.height;
    const slotW = fullW / 4;

    for (let i = 0; i < 4; i++) {
      const x = i * slotW;

      const fullSlot = cropCanvas(rewardBandCanvas, x, 0, slotW, fullH);

      const textBand = cropCanvas(
        rewardBandCanvas,
        x + slotW * 0.05,
        fullH * 0.44,
        slotW * 0.90,
        fullH * 0.26
      );

      const tightText = cropCanvas(
        rewardBandCanvas,
        x + slotW * 0.08,
        fullH * 0.52,
        slotW * 0.84,
        fullH * 0.18
      );

      slots.push({ fullSlot, textBand, tightText });
    }

    return slots;
  }

  async function runOCR(canvas, onStatus, label) {
    if (!window.Tesseract) {
      throw new Error("Tesseract.js failed to load.");
    }

    const result = await window.Tesseract.recognize(canvas, "eng", {
      logger: (m) => {
        if (!onStatus) return;
        if (m.status === "recognizing text") {
          const pct = Math.round((m.progress || 0) * 100);
          onStatus(`Running OCR ${label}… ${pct}%`);
        }
      },
      tessedit_pageseg_mode: 6,
      preserve_interword_spaces: "1"
    });

    return result?.data?.text || "";
  }

  function isJunkLine(line) {
    const s = normalizeText(line);
    if (!s) return true;
    if (s.length < 2) return true;

    if (
      /void fissure|rewards|endless bonus|relics opened|reactant|bonus|owned|squad|message|host/.test(s) ||
      /\b\d+%/.test(s)
    ) {
      return true;
    }

    return false;
  }

  function cleanLines(rawText) {
    return String(rawText || "")
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => s.replace(/[|_[\]{}~<>]+/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .filter(s => /[a-z]/i.test(s))
      .filter(s => !isJunkLine(s));
  }

  function buildCandidatesFromLines(lines) {
    const out = [];
    const seen = new Set();

    const push = (s) => {
      const clean = s.replace(/\s+/g, " ").trim();
      const key = normalizeText(clean);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(clean);
    };

    for (const line of lines) push(line);

    for (let i = 0; i < lines.length; i++) {
      push(lines.slice(i, i + 2).join(" "));
      push(lines.slice(i, i + 3).join(" "));
      push(lines.slice(i, i + 4).join(" "));
    }

    if (lines.length) push(lines.join(" "));
    return out;
  }

  function getRootAndComponent(name) {
    const norm = normalizeText(name);
    const m = norm.match(/^(.+?\bprime)\s*(.*)$/);
    if (!m) {
      return { root: norm, component: "" };
    }
    return {
      root: m[1].trim(),
      component: (m[2] || "").trim()
    };
  }

  function buildKnownRootMap(knownItems) {
    const map = new Map();
    for (const item of knownItems) {
      if (!map.has(item.root)) map.set(item.root, []);
      map.get(item.root).push(item);
    }
    return map;
  }

  function buildKnownComponentList(knownItems) {
    return [...new Set(knownItems.map(i => i.component).filter(Boolean))];
  }

  function tokenize(text) {
    return normalizeText(text).split(" ").filter(Boolean);
  }

  function extractOrderedRootsFromOCR(globalTexts, knownRoots) {
    const words = tokenize(globalTexts.join(" "));
    const hits = [];

    for (let i = 0; i < words.length; i++) {
      for (let len = 2; len <= 4; len++) {
        const gram = words.slice(i, i + len).join(" ");
        if (!gram.includes("prime")) continue;

        let bestRoot = "";
        let bestScore = 0;

        for (const root of knownRoots) {
          const s = stringScore(gram, root);
          if (s > bestScore) {
            bestScore = s;
            bestRoot = root;
          }
        }

        if (bestScore >= 0.84) {
          hits.push({ root: bestRoot, pos: i, len, score: bestScore });
        }
      }
    }

    hits.sort((a, b) => a.pos - b.pos || b.len - a.len || b.score - a.score);

    const out = [];
    const seen = new Set();
    let lastPos = -999;

    for (const h of hits) {
      if (seen.has(h.root)) continue;
      if (Math.abs(h.pos - lastPos) <= 1) continue;
      seen.add(h.root);
      out.push(h.root);
      lastPos = h.pos;
    }

    return out.slice(0, 4);
  }

  function extractOrderedComponentsFromOCR(globalTexts, knownComponents) {
    const words = tokenize(globalTexts.join(" "));
    const hits = [];

    for (let i = 0; i < words.length; i++) {
      for (let len = 1; len <= 3; len++) {
        const gram = words.slice(i, i + len).join(" ");
        if (!gram) continue;

        let bestComp = "";
        let bestScore = 0;

        for (const comp of knownComponents) {
          const s = stringScore(gram, comp);
          if (s > bestScore) {
            bestScore = s;
            bestComp = comp;
          }
        }

        if (bestScore >= 0.76) {
          hits.push({
            component: bestComp,
            pos: i,
            len,
            score: bestScore
          });
        }
      }
    }

    hits.sort((a, b) => a.pos - b.pos || b.len - a.len || b.score - a.score);

    const out = [];
    let cursor = -1;

    for (const h of hits) {
      if (h.pos < cursor) continue;
      out.push(h.component);
      cursor = h.pos + h.len;
      if (out.length >= 4) break;
    }

    return out;
  }

  function findLocalRoot(localCandidates, knownRoots) {
    let bestRoot = "";
    let bestScore = 0;
    let bestSource = "";

    for (const c of localCandidates) {
      for (const root of knownRoots) {
        const s = stringScore(c, root);
        if (s > bestScore) {
          bestScore = s;
          bestRoot = root;
          bestSource = c;
        }
      }
    }

    if (bestScore >= 0.72) {
      return { root: bestRoot, score: bestScore, source: bestSource };
    }
    return null;
  }

  function findLocalComponent(localCandidates, knownComponents) {
    let bestComp = "";
    let bestScore = 0;
    let bestSource = "";

    for (const c of localCandidates) {
      for (const comp of knownComponents) {
        const s = stringScore(c, comp);
        if (s > bestScore) {
          bestScore = s;
          bestComp = comp;
          bestSource = c;
        }
      }
    }

    if (bestScore >= 0.70) {
      return { component: bestComp, score: bestScore, source: bestSource };
    }
    return null;
  }

  function bestItemFromCandidates(candidates, candidateItems) {
    let best = null;
    let bestScore = 0;
    let bestSource = "";

    for (const c of candidates) {
      for (const item of candidateItems) {
        const s = stringScore(c, item.norm);
        if (s > bestScore) {
          bestScore = s;
          best = item;
          bestSource = c;
        }
      }
    }

    if (!best) return null;
    return { item: best, score: bestScore, source: bestSource };
  }

  function exactItemFromRootAndComponent(root, component, rootMap) {
    if (!root || !rootMap.has(root)) return null;
    const items = rootMap.get(root);
    if (!component) return null;
    return items.find(i => i.component === component) || null;
  }

  function findItemsByLooseComponent(root, component, rootMap) {
    if (!root || !rootMap.has(root) || !component) return [];
    const normComp = normalizeText(component);
    return rootMap.get(root).filter(i =>
      i.component === normComp ||
      i.component.includes(normComp) ||
      normComp.includes(i.component)
    );
  }

  function reconstructSlotChoice(slotRoot, slotComponent, localCandidates, rootMap) {
    if (!slotRoot || !rootMap.has(slotRoot)) return null;

    const items = rootMap.get(slotRoot);

    const exact = exactItemFromRootAndComponent(slotRoot, slotComponent, rootMap);
    if (exact) {
      return { item: exact, confidence: 0.98, source: `${slotRoot} ${slotComponent}`.trim() };
    }

    const looseMatches = findItemsByLooseComponent(slotRoot, slotComponent, rootMap);
    if (looseMatches.length === 1) {
      return { item: looseMatches[0], confidence: 0.92, source: `${slotRoot} ${slotComponent}`.trim() };
    }

    const best = bestItemFromCandidates(localCandidates, items);
    if (best && best.score >= 0.56) {
      return { item: best.item, confidence: best.score, source: best.source };
    }

    if (!slotComponent && items.length === 1) {
      return { item: items[0], confidence: 0.86, source: slotRoot };
    }

    return null;
  }

  function renderResults(container, rows) {
    container.innerHTML = "";

    if (!rows.length) {
      container.innerHTML = `<div class="scannerEmpty">No confident item matches yet. Try another reward screenshot.</div>`;
      container.classList.remove("hidden");
      return;
    }

    for (const row of rows) {
      const medalHtml = row.medal ? `<div class="scannerMedal">${row.medal}</div>` : `<div class="scannerMedal"></div>`;

      const div = document.createElement("div");
      div.className = "scannerRow";
      div.innerHTML = `
        <div class="scannerLeft">
          <div class="scannerName">${escapeHtml(row.itemName)}</div>
          <div class="scannerMeta">OCR: ${escapeHtml(row.ocrText)} • Match ${(row.confidence * 100).toFixed(0)}%</div>
        </div>
        <div class="scannerRight">
          ${medalHtml}
          <div class="scannerPlat">${typeof row.price === "number" ? `${row.price}p` : "?"}</div>
        </div>
      `;
      container.appendChild(div);
    }

    container.classList.remove("hidden");
  }

  window.createRewardScanner = function createRewardScanner(options) {
    const fileInput = document.getElementById(options.fileInputId);
    const uploadBtn = document.getElementById(options.uploadBtnId);
    const clearBtn = document.getElementById(options.clearBtnId);
    const statusEl = document.getElementById(options.statusId);
    const previewWrap = document.getElementById(options.previewWrapId);
    const previewImg = document.getElementById(options.previewImgId);
    const resultsEl = document.getElementById(options.resultsId);
    const debugWrap = document.getElementById(options.debugWrapId);
    const debugText = document.getElementById(options.debugTextId);
    const debugActions = document.getElementById(options.debugActionsId);
    const copyDebugBtn = document.getElementById(options.copyDebugBtnId);

    let knownItems = [];
    let prices = {};

    function setStatus(msg) {
      if (statusEl) statusEl.textContent = msg || "";
    }

    function setData(itemNames, priceMap) {
      prices = priceMap || {};

      knownItems = [...new Set((itemNames || []).filter(Boolean))]
        .map(name => {
          const parsed = getRootAndComponent(name);
          return {
            name,
            norm: normalizeText(name),
            root: parsed.root,
            component: parsed.component
          };
        });
    }

    async function copyDebug() {
      const text = debugText?.textContent || "";
      if (!text.trim()) return;

      try {
        await navigator.clipboard.writeText(text);
        setStatus("OCR debug copied");
      } catch {
        setStatus("Could not copy OCR debug");
      }
    }

    function clear() {
      if (fileInput) fileInput.value = "";
      if (previewImg) previewImg.removeAttribute("src");

      previewWrap?.classList.add("hidden");

      if (resultsEl) {
        resultsEl.innerHTML = "";
        resultsEl.classList.add("hidden");
      }

      if (debugText) debugText.textContent = "";
      debugWrap?.classList.add("hidden");
      debugActions?.classList.add("hidden");

      setStatus("Ready to scan");
    }

    async function handleFile(file) {
      if (!file) return;

      if (!knownItems.length) {
        setStatus("Scanner is still loading item data…");
        return;
      }

      setStatus("Reading image…");
      const { img, dataUrl } = await fileToImage(file);

      if (previewImg) previewImg.src = dataUrl;
      previewWrap?.classList.remove("hidden");

      setStatus("Preparing image…");
      const baseCanvas = prepareCanvas(img);
      const rewardBand = getRewardBandCanvas(baseCanvas);
      const slots = getSlotCanvases(rewardBand);

      const wholeText = await runOCR(baseCanvas, setStatus, "(whole image)");
      const rewardBandText = await runOCR(rewardBand, setStatus, "(reward band)");

      const globalTexts = [wholeText, rewardBandText];

      const rootMap = buildKnownRootMap(knownItems);
      const knownRoots = [...rootMap.keys()];
      const knownComponents = buildKnownComponentList(knownItems);

      const orderedRoots = extractOrderedRootsFromOCR(globalTexts, knownRoots);
      const orderedComponents = extractOrderedComponentsFromOCR(globalTexts, knownComponents);

      const matchedRows = [];
      const usedNames = new Set();
      const debugParts = [];

      debugParts.push(
        `WHOLE IMAGE OCR\n${wholeText.trim() || "(none)"}\n\n` +
        `REWARD BAND OCR\n${rewardBandText.trim() || "(none)"}\n\n` +
        `ORDERED ROOTS:\n${orderedRoots.join("\n") || "(none)"}\n\n` +
        `ORDERED COMPONENTS:\n${orderedComponents.join("\n") || "(none)"}\n\n` +
        `========================================`
      );

      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];

        const fullText = await runOCR(slot.fullSlot, setStatus, `(slot ${i + 1}/4 full)`);
        const textBandText = await runOCR(
          upscaleCanvas(thresholdCanvas(slot.textBand, 150, 90), 2),
          setStatus,
          `(slot ${i + 1}/4 text band)`
        );
        const tightTextText = await runOCR(
          upscaleCanvas(thresholdCanvas(slot.tightText, 145, 85), 2),
          setStatus,
          `(slot ${i + 1}/4 tight text)`
        );

        const localLines = [
          ...new Set([
            ...cleanLines(fullText),
            ...cleanLines(textBandText),
            ...cleanLines(tightTextText)
          ])
        ];

        const localCandidates = buildCandidatesFromLines(localLines);

        const localRootHit = findLocalRoot(localCandidates, knownRoots);
        const localCompHit = findLocalComponent(localCandidates, knownComponents);

        const slotRoot = localRootHit?.root || orderedRoots[i] || "";
        const slotComponent = localCompHit?.component || orderedComponents[i] || "";

        let chosen = null;

        const reconstructed = reconstructSlotChoice(slotRoot, slotComponent, localCandidates, rootMap);
        if (reconstructed && !usedNames.has(reconstructed.item.name)) {
          chosen = {
            slot: i,
            ocrText: reconstructed.source || [slotRoot, slotComponent].filter(Boolean).join(" "),
            itemName: reconstructed.item.name,
            confidence: reconstructed.confidence,
            price: typeof prices[reconstructed.item.name] === "number" ? prices[reconstructed.item.name] : null
          };
        }

        if (!chosen && localRootHit && localRootHit.score >= 0.90 && rootMap.has(localRootHit.root)) {
          const items = rootMap.get(localRootHit.root).filter(x => !usedNames.has(x.name));
          const best = bestItemFromCandidates(localCandidates, items);
          if (best && best.score >= 0.68) {
            chosen = {
              slot: i,
              ocrText: best.source || localRootHit.root,
              itemName: best.item.name,
              confidence: best.score,
              price: typeof prices[best.item.name] === "number" ? prices[best.item.name] : null
            };
          }
        }

        if (chosen) {
          usedNames.add(chosen.itemName);
          matchedRows.push(chosen);
        }

        debugParts.push(
          `SLOT ${i + 1}\n` +
          `FULL OCR:\n${fullText.trim() || "(none)"}\n\n` +
          `TEXT BAND OCR:\n${textBandText.trim() || "(none)"}\n\n` +
          `TIGHT TEXT OCR:\n${tightTextText.trim() || "(none)"}\n\n` +
          `LOCAL CANDIDATES:\n${localCandidates.join("\n") || "(none)"}\n\n` +
          `LOCAL ROOT: ${localRootHit ? `${localRootHit.root} (${(localRootHit.score * 100).toFixed(0)}%)` : "(none)"}\n` +
          `LOCAL COMPONENT: ${localCompHit ? `${localCompHit.component} (${(localCompHit.score * 100).toFixed(0)}%)` : "(none)"}\n` +
          `SLOT ROOT: ${slotRoot || "(none)"}\n` +
          `SLOT COMPONENT: ${slotComponent || "(none)"}\n\n` +
          `BEST MATCH:\n${chosen ? `${chosen.itemName} (${(chosen.confidence * 100).toFixed(0)}%)` : "(none)"}\n` +
          `----------------------------------------`
        );
      }

      matchedRows.sort((a, b) =>
        (b.price ?? -1) - (a.price ?? -1) ||
        b.confidence - a.confidence ||
        a.itemName.localeCompare(b.itemName)
      );

      const finalRows = matchedRows.slice(0, 4).map((row, i) => ({
        ...row,
        medal: MEDALS[i] || ""
      }));

      renderResults(resultsEl, finalRows);

      if (debugText) {
        debugText.textContent = debugParts.join("\n\n");
      }
      debugWrap?.classList.remove("hidden");
      debugActions?.classList.remove("hidden");

      setStatus(finalRows.length ? "Scan complete" : "Scan complete — no confident matches");
    }

    uploadBtn?.addEventListener("click", () => fileInput?.click());
    clearBtn?.addEventListener("click", clear);
    copyDebugBtn?.addEventListener("click", copyDebug);

    fileInput?.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      handleFile(file).catch(err => {
        console.error(err);
        setStatus(`Scan failed: ${err.message || err}`);
      });
    });

    clear();

    return {
      setData,
      clear
    };
  };
})();
