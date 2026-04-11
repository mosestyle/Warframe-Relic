(function () {
  const MEDALS = ["🥇", "🥈", "🥉", "4th"];

  function normalizeText(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[’'`´]/g, "")
      .replace(/[^a-z0-9+\s]/g, " ")
      .replace(/\bblueprlnt\b/g, "blueprint")
      .replace(/\bsysterns\b/g, "systems")
      .replace(/\bneuroptlcs\b/g, "neuroptics")
      .replace(/\brecelver\b/g, "receiver")
      .replace(/\bchassls\b/g, "chassis")
      .replace(/\bprlme\b/g, "prime")
      .replace(/\s+/g, " ")
      .trim();
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
    const containsBoost = bi.includes(ai) || ai.includes(bi) ? 0.08 : 0;

    return Math.max(0, Math.min(1, overlap * 0.55 + lev * 0.45 + containsBoost));
  }

  function extractCandidateLines(rawText) {
    const lines = String(rawText || "")
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean)
      .filter(s => s.length >= 5)
      .filter(s => /[a-z]/i.test(s))
      .filter(s => !/void fissure|choose your reward|reactant|item reward/i.test(s));

    const unique = [];
    const seen = new Set();

    for (const line of lines) {
      const key = normalizeText(line);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(line);
    }

    return unique;
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
      const boosted = gray > 165 ? 255 : gray < 90 ? 0 : gray;
      data[i] = boosted;
      data[i + 1] = boosted;
      data[i + 2] = boosted;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  async function runOCR(canvas, onStatus) {
    if (!window.Tesseract) {
      throw new Error("Tesseract.js failed to load.");
    }

    const result = await window.Tesseract.recognize(canvas, "eng", {
      logger: (m) => {
        if (!onStatus) return;

        if (m.status === "recognizing text") {
          const pct = Math.round((m.progress || 0) * 100);
          onStatus(`Running OCR… ${pct}%`);
        } else if (typeof m.status === "string") {
          onStatus(`${m.status.charAt(0).toUpperCase()}${m.status.slice(1)}…`);
        }
      }
    });

    return result?.data?.text || "";
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
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

    function matchLinesToItems(lines) {
      const used = new Set();
      const results = [];

      for (const line of lines) {
        let best = null;
        let bestScore = 0;

        for (const item of knownItems) {
          if (used.has(item.name)) continue;

          const score = stringScore(line, item.norm);
          if (score > bestScore) {
            bestScore = score;
            best = item;
          }
        }

        if (best && bestScore >= 0.55) {
          used.add(best.name);
          results.push({
            ocrText: line,
            itemName: best.name,
            confidence: bestScore,
            price: typeof prices[best.name] === "number" ? prices[best.name] : null
          });
        }
      }

      results.sort((a, b) =>
        (b.price ?? -1) - (a.price ?? -1) ||
        b.confidence - a.confidence ||
        a.itemName.localeCompare(b.itemName)
      );

      return results.slice(0, 4).map((row, i) => ({
        ...row,
        medal: MEDALS[i] || `${i + 1}th`
      }));
    }

    function renderResults(rows) {
      if (!resultsEl) return;

      resultsEl.innerHTML = "";

      if (!rows.length) {
        resultsEl.innerHTML = `<div class="scannerEmpty">No confident item matches yet. Try a clearer screenshot of the reward screen.</div>`;
        resultsEl.classList.remove("hidden");
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
        resultsEl.appendChild(div);
      }

      resultsEl.classList.remove("hidden");
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
      const canvas = prepareCanvas(img);

      const rawText = await runOCR(canvas, setStatus);
      const lines = extractCandidateLines(rawText);
      const matches = matchLinesToItems(lines);

      renderResults(matches);

      if (debugText) {
        debugText.textContent = rawText.trim() || "(No OCR text detected)";
      }
      debugWrap?.classList.remove("hidden");

      setStatus(matches.length ? "Scan complete" : "Scan complete — no confident matches");
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
