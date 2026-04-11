(function () {
  const MEDALS = ["🥇", "🥈", "🥉", "4th"];

  function normalizeText(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[’'`´]/g, "")
      .replace(/[^a-z0-9+\s]/g, " ")
      .replace(/\bblueprlnt\b/g, "blueprint")
      .replace(/\bblueprints\b/g, "blueprint")
      .replace(/\bsysterns\b/g, "systems")
      .replace(/\bsystern\b/g, "system")
      .replace(/\bneuroptlcs\b/g, "neuroptics")
      .replace(/\bneuropticss\b/g, "neuroptics")
      .replace(/\brecelver\b/g, "receiver")
      .replace(/\brecelver\b/g, "receiver")
      .replace(/\bchassls\b/g, "chassis")
      .replace(/\bprlme\b/g, "prime")
      .replace(/\bashenme\b/g, "ash prime")
      .replace(/\bcarrier prlme\b/g, "carrier prime")
      .replace(/\bsaryn prlme\b/g, "saryn prime")
      .replace(/\bnova prlme\b/g, "nova prime")
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

    return Math.max(0, Math.min(1, overlap * 0.58 + lev * 0.42 + containsBoost));
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

  function prepareCanvas(img) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const maxW = 2200;
    const scale = img.width > maxW ? (maxW / img.width) : 1;

    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114);

      // slightly softer thresholding than before
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
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));

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

  function getRewardBandCanvas(baseCanvas) {
    const w = baseCanvas.width;
    const h = baseCanvas.height;

    // tuned for Warframe reward screen
    const x = w * 0.17;
    const y = h * 0.22;
    const cw = w * 0.67;
    const ch = h * 0.34;

    return cropCanvas(baseCanvas, x, y, cw, ch);
  }

  function getColumnCanvases(rewardBandCanvas) {
    const cols = [];
    const fullW = rewardBandCanvas.width;
    const fullH = rewardBandCanvas.height;
    const colW = fullW / 4;

    for (let i = 0; i < 4; i++) {
      const x = i * colW;

      // full column
      const fullCol = cropCanvas(rewardBandCanvas, x, 0, colW, fullH);

      // lower text zone in each reward card
      const textZone = cropCanvas(
        rewardBandCanvas,
        x,
        fullH * 0.46,
        colW,
        fullH * 0.34
      );

      cols.push({ fullCol, textZone });
    }

    return cols;
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
    if (s.length < 3) return true;

    if (
      /void fissure|rewards|endless bonus|relics opened|reactant|bonus/.test(s) ||
      /\b\d+%/.test(s) ||
      /\b\d+\b/.test(s) && s.length < 6
    ) {
      return true;
    }

    // likely player names / garbage
    if (
      !/prime|blueprint|systems|system|neuroptics|chassis|cerebrum|receiver|barrel|stock|handle|harness|blade|gauntlet|wings|carapace|pt|bp/.test(s) &&
      s.split(" ").length <= 2 &&
      s.length < 16
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

    for (const line of lines) {
      push(line);
    }

    for (let i = 0; i < lines.length; i++) {
      push(lines.slice(i, i + 2).join(" "));
      push(lines.slice(i, i + 3).join(" "));
      push(lines.slice(i, i + 4).join(" "));
    }

    if (lines.length) {
      push(lines.join(" "));
    }

    return out;
  }

  function bestMatchForColumn(candidates, knownItems, usedNames, prices) {
    let best = null;
    let bestScore = 0;
    let bestCandidate = "";

    for (const candidate of candidates) {
      for (const item of knownItems) {
        if (usedNames.has(item.name)) continue;

        const score = stringScore(candidate, item.norm);
        if (score > bestScore) {
          bestScore = score;
          best = item;
          bestCandidate = candidate;
        }
      }
    }

    if (!best || bestScore < 0.50) return null;

    usedNames.add(best.name);

    return {
      ocrText: bestCandidate,
      itemName: best.name,
      confidence: bestScore,
      price: typeof prices[best.name] === "number" ? prices[best.name] : null
    };
  }

  function renderResults(container, rows) {
    container.innerHTML = "";

    if (!rows.length) {
      container.innerHTML = `<div class="scannerEmpty">No confident item matches yet. Try another reward screenshot.</div>`;
      container.classList.remove("hidden");
      return;
    }

    for (const row of rows) {
      const div = document.createElement("div");
      div.className = "scannerRow";
      div.innerHTML = `
        <div class="scannerLeft">
          <div class="scannerName">${escapeHtml(row.itemName)}</div>
          <div class="scannerMeta">OCR: ${escapeHtml(row.ocrText)} • Match ${(row.confidence * 100).toFixed(0)}%</div>
        </div>
        <div class="scannerRight">
          <div class="scannerMedal">${row.medal}</div>
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

    let knownItems = [];
    let prices = {};

    function setStatus(msg) {
      if (statusEl) statusEl.textContent = msg || "";
    }

    function setData(itemNames, priceMap) {
      knownItems = [...new Set((itemNames || []).filter(Boolean))]
        .map(name => ({
          name,
          norm: normalizeText(name)
        }));

      prices = priceMap || {};
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
      const columns = getColumnCanvases(rewardBand);

      const debugParts = [];
      const usedNames = new Set();
      const matchedRows = [];

      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];

        const fullText = await runOCR(col.fullCol, setStatus, `(column ${i + 1}/4 full)`);
        const textOnly = await runOCR(col.textZone, setStatus, `(column ${i + 1}/4 text)`);

        const fullLines = cleanLines(fullText);
        const textLines = cleanLines(textOnly);

        const mergedLines = [...new Set([...textLines, ...fullLines])];
        const candidates = buildCandidatesFromLines(mergedLines);
        const best = bestMatchForColumn(candidates, knownItems, usedNames, prices);

        debugParts.push(
          `COLUMN ${i + 1}\n` +
          `FULL OCR:\n${fullText.trim() || "(none)"}\n\n` +
          `TEXT OCR:\n${textOnly.trim() || "(none)"}\n\n` +
          `CLEAN LINES:\n${mergedLines.join("\n") || "(none)"}\n\n` +
          `CANDIDATES:\n${candidates.join("\n") || "(none)"}\n\n` +
          `BEST MATCH:\n${best ? `${best.itemName} (${(best.confidence * 100).toFixed(0)}%)` : "(none)"}\n` +
          `----------------------------------------`
        );

        if (best) {
          matchedRows.push(best);
        }
      }

      matchedRows.sort((a, b) =>
        (b.price ?? -1) - (a.price ?? -1) ||
        b.confidence - a.confidence ||
        a.itemName.localeCompare(b.itemName)
      );

      const finalRows = matchedRows.map((row, i) => ({
        ...row,
        medal: MEDALS[i] || `${i + 1}th`
      }));

      renderResults(resultsEl, finalRows);

      if (debugText) {
        debugText.textContent = debugParts.join("\n\n");
      }
      debugWrap?.classList.remove("hidden");

      setStatus(finalRows.length ? "Scan complete" : "Scan complete — no confident matches");
    }

    uploadBtn?.addEventListener("click", () => fileInput?.click());
    clearBtn?.addEventListener("click", clear);

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
