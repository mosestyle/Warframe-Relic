(function () {
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
      .replace(/\bwakong\b/g, "wukong")
      .replace(/\bnukong\b/g, "wukong")
      .replace(/\bmirag\b/g, "mirage")
      .replace(/\bprifie\b/g, "prime")
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

  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
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

  function thresholdCanvas(sourceCanvas, lightCut = 160, darkCut = 80) {
    const canvas = makeCanvas(sourceCanvas.width, sourceCanvas.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(sourceCanvas, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
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

  function canvasToDataUrl(canvas) {
    return canvas.toDataURL("image/png");
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
          onStatus(`OCR ${label}… ${pct}%`);
        }
      },
      tessedit_pageseg_mode: 6,
      preserve_interword_spaces: "1"
    });

    return result?.data?.text || "";
  }

  function cleanOcrText(raw) {
    return normalizeText(
      String(raw || "")
        .replace(/[|_[\]{}~<>]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );
  }

  function renderScanResults(container, rows) {
    container.innerHTML = "";

    if (!rows.length) {
      container.innerHTML = `<div class="scannerEmpty">No confident matches yet.</div>`;
      container.classList.remove("hidden");
      return;
    }

    rows.forEach((row) => {
      const div = document.createElement("div");
      div.className = "scannerRow";
      div.innerHTML = `
        <div class="scannerLeft">
          <div class="scannerName">${escapeHtml(row.item)}</div>
          <div class="scannerMeta">OCR: ${escapeHtml(row.ocrText || "")} • Match ${Math.round((row.score || 0) * 100)}%</div>
        </div>
        <div class="scannerRight">
          <div class="scannerMedal">${row.medal || ""}</div>
          <div class="scannerPlat">${typeof row.plat === "number" && row.plat >= 0 ? `${row.plat}p` : "?"}</div>
        </div>
      `;
      container.appendChild(div);
    });

    container.classList.remove("hidden");
  }

  window.createScreenScanner = function createScreenScanner(options) {
    const fileInput = document.getElementById(options.fileInputId);
    const uploadBtn = document.getElementById(options.uploadBtnId);
    const clearBtn = document.getElementById(options.clearBtnId);
    const modeTapBtn = document.getElementById(options.modeTapId);
    const modeWideBtn = document.getElementById(options.modeWideId);
    const stageWrap = document.getElementById(options.stageWrapId);
    const stage = document.getElementById(options.stageId);
    const canvas = document.getElementById(options.canvasId);
    const overlay = document.getElementById(options.overlayId);
    const hintEl = document.getElementById(options.hintId);
    const statusEl = document.getElementById(options.statusId);
    const previewsWrap = document.getElementById(options.previewsWrapId);
    const previewEls = options.previewIds.map(id => document.getElementById(id));
    const runBtn = document.getElementById(options.runBtnId);
    const actionRow = document.getElementById(options.actionRowId);
    const resultsEl = document.getElementById(options.resultsId);
    const debugWrap = document.getElementById(options.debugWrapId);
    const debugText = document.getElementById(options.debugTextId);
    const getRewardPool = options.getRewardPool;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const overlayCtx = overlay.getContext("2d");

    let image = null;
    let imageBitmap = null;
    let displayScale = 1;
    let renderW = 0;
    let renderH = 0;

    let mode = "tap";
    let tapPoints = [];
    let wideRect = null;
    let cropCanvases = [null, null, null, null];

    let pointerState = {
      active: false,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      moved: false
    };

    function setStatus(msg) {
      if (statusEl) statusEl.textContent = msg || "";
    }

    function setHint() {
      if (!hintEl) return;
      hintEl.textContent = mode === "tap"
        ? "Tap 4 reward cards."
        : "Drag one wide box across the reward text row.";
    }

    function setMode(nextMode) {
      mode = nextMode === "wide" ? "wide" : "tap";
      modeTapBtn?.classList.toggle("active", mode === "tap");
      modeWideBtn?.classList.toggle("active", mode === "wide");
      setHint();
      clearSelectionOnly();
      redraw();
    }

    function clearPreviewImages() {
      previewEls.forEach(img => img.removeAttribute("src"));
      cropCanvases = [null, null, null, null];
      previewsWrap?.classList.add("hidden");
      actionRow?.classList.add("hidden");
    }

    function clearSelectionOnly() {
      tapPoints = [];
      pointerState = {
        active: false,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        moved: false
      };
      wideRect = null;
      clearPreviewImages();
      if (resultsEl) {
        resultsEl.innerHTML = "";
        resultsEl.classList.add("hidden");
      }
      if (debugText) debugText.textContent = "";
      debugWrap?.classList.add("hidden");
    }

    function clearAll() {
      fileInput.value = "";
      image = null;
      imageBitmap = null;
      renderW = 0;
      renderH = 0;
      canvas.width = 1;
      canvas.height = 1;
      overlay.width = 1;
      overlay.height = 1;
      stageWrap?.classList.add("hidden");
      clearSelectionOnly();
      setStatus("Pick relics, then upload a screenshot.");
    }

    function getRewardPoolSafe() {
      const pool = typeof getRewardPool === "function" ? getRewardPool() : [];
      return Array.isArray(pool) ? pool : [];
    }

    function fileToImage(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    function fitImageToStage(img) {
      const maxW = stage.clientWidth || 800;
      const maxH = Math.max(260, Math.round(window.innerHeight * 0.45));

      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      renderW = Math.max(1, Math.round(img.width * scale));
      renderH = Math.max(1, Math.round(img.height * scale));
      displayScale = img.width / renderW;

      canvas.width = renderW;
      canvas.height = renderH;
      overlay.width = renderW;
      overlay.height = renderH;
    }

    function redraw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

      if (imageBitmap) {
        ctx.drawImage(imageBitmap, 0, 0, renderW, renderH);
      }

      overlayCtx.lineWidth = 2;
      overlayCtx.strokeStyle = "#41d27a";
      overlayCtx.fillStyle = "rgba(65,210,122,0.15)";

      if (mode === "tap") {
        tapPoints.forEach((p, idx) => {
          const box = getTapCropRect(p.x, p.y);
          overlayCtx.fillRect(box.x, box.y, box.w, box.h);
          overlayCtx.strokeRect(box.x, box.y, box.w, box.h);

          overlayCtx.fillStyle = "#41d27a";
          overlayCtx.beginPath();
          overlayCtx.arc(p.x, p.y, 10, 0, Math.PI * 2);
          overlayCtx.fill();

          overlayCtx.fillStyle = "#0b0f14";
          overlayCtx.font = "bold 12px system-ui";
          overlayCtx.textAlign = "center";
          overlayCtx.textBaseline = "middle";
          overlayCtx.fillText(String(idx + 1), p.x, p.y);

          overlayCtx.fillStyle = "rgba(65,210,122,0.15)";
        });
      } else {
        const rect = pointerState.active
          ? normalizeRect(pointerState.startX, pointerState.startY, pointerState.currentX, pointerState.currentY)
          : wideRect;

        if (rect) drawWideRect(rect);
      }
    }

    function drawWideRect(rect) {
      overlayCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
      overlayCtx.strokeRect(rect.x, rect.y, rect.w, rect.h);

      const colW = rect.w / 4;
      overlayCtx.strokeStyle = "rgba(65,210,122,0.9)";
      for (let i = 1; i < 4; i++) {
        const x = rect.x + colW * i;
        overlayCtx.beginPath();
        overlayCtx.moveTo(x, rect.y);
        overlayCtx.lineTo(x, rect.y + rect.h);
        overlayCtx.stroke();
      }
      overlayCtx.strokeStyle = "#41d27a";
    }

    function normalizeRect(x1, y1, x2, y2) {
      const x = Math.min(x1, x2);
      const y = Math.min(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      return { x, y, w, h };
    }

    function getRelativePointerPos(evt) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(renderW, evt.clientX - rect.left)),
        y: Math.max(0, Math.min(renderH, evt.clientY - rect.top))
      };
    }

    function getTapCropRect(x, y) {
      // narrower + taller than before
      const w = renderW * 0.19;
      const h = renderH * 0.28;

      // slight downward bias
      const cx = x;
      const cy = y + renderH * 0.03;

      let rx = cx - w / 2;
      let ry = cy - h / 2;

      rx = Math.max(0, Math.min(renderW - w, rx));
      ry = Math.max(0, Math.min(renderH - h, ry));

      return { x: rx, y: ry, w, h };
    }

    function buildCropCanvasesFromTap() {
      cropCanvases = [null, null, null, null];
      tapPoints.forEach((p, i) => {
        const rect = getTapCropRect(p.x, p.y);
        cropCanvases[i] = cropFromDisplayedRect(rect);
      });
      updateCropPreviews();
    }

    function buildCropCanvasesFromWideRect() {
      cropCanvases = [null, null, null, null];
      if (!wideRect || wideRect.w < 20 || wideRect.h < 20) {
        updateCropPreviews();
        return;
      }

      const colW = wideRect.w / 4;
      for (let i = 0; i < 4; i++) {
        const rect = {
          x: wideRect.x + colW * i,
          y: wideRect.y,
          w: colW,
          h: wideRect.h
        };
        cropCanvases[i] = cropFromDisplayedRect(rect);
      }
      updateCropPreviews();
    }

    function cropFromDisplayedRect(rect) {
      if (!imageBitmap) return null;

      const srcX = rect.x * displayScale;
      const srcY = rect.y * displayScale;
      const srcW = rect.w * displayScale;
      const srcH = rect.h * displayScale;

      const sourceCanvas = makeCanvas(image.width, image.height);
      const sctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
      sctx.drawImage(imageBitmap, 0, 0, image.width, image.height);

      return cropCanvas(sourceCanvas, srcX, srcY, srcW, srcH);
    }

    function updateCropPreviews() {
      let any = false;

      cropCanvases.forEach((crop, i) => {
        const img = previewEls[i];
        if (!img) return;
        if (crop) {
          img.src = canvasToDataUrl(crop);
          any = true;
        } else {
          img.removeAttribute("src");
        }
      });

      previewsWrap?.classList.toggle("hidden", !any);
      actionRow?.classList.toggle("hidden", !any);
    }

    function getBestMatchForPool(ocrText, rewardPool) {
      const clean = cleanOcrText(ocrText);
      if (!clean) return null;

      let best = null;
      let bestScore = 0;

      for (const entry of rewardPool) {
        const score = stringScore(clean, entry.item);
        if (score > bestScore) {
          bestScore = score;
          best = entry;
        }
      }

      if (!best || bestScore < 0.42) return null;

      return {
        ...best,
        score: bestScore,
        ocrText: clean
      };
    }

    async function analyzeCrops() {
      const rewardPool = getRewardPoolSafe();

      if (!rewardPool.length) {
        setStatus("Pick at least 1 relic first, then Analyze crops.");
        return;
      }

      const validCrops = cropCanvases.filter(Boolean);
      if (!validCrops.length) {
        setStatus("Create tap crops or a wide-box first.");
        return;
      }

      const debugParts = [];
      const rawMatches = [];

      for (let i = 0; i < cropCanvases.length; i++) {
        const crop = cropCanvases[i];
        if (!crop) continue;

        const ocrCanvas = upscaleCanvas(thresholdCanvas(crop, 150, 90), 2);
        const text = await runOCR(ocrCanvas, setStatus, `crop ${i + 1}`);
        const match = getBestMatchForPool(text, rewardPool);

        debugParts.push(
          `CROP ${i + 1}\n` +
          `OCR:\n${text.trim() || "(none)"}\n\n` +
          `CLEAN:\n${cleanOcrText(text) || "(none)"}\n\n` +
          `BEST MATCH:\n${match ? `${match.item} (${Math.round(match.score * 100)}%)` : "(none)"}\n` +
          `----------------------------------------`
        );

        if (match) {
          rawMatches.push({
            ...match,
            cropIndex: i
          });
        }
      }

      const byBestItem = new Map();
      rawMatches.forEach((m) => {
        const prev = byBestItem.get(m.item);
        if (!prev || m.score > prev.score) {
          byBestItem.set(m.item, m);
        }
      });

      const finalMatches = [...byBestItem.values()]
        .sort((a, b) =>
          (b.plat ?? -1) - (a.plat ?? -1) ||
          b.score - a.score ||
          a.item.localeCompare(b.item)
        )
        .slice(0, 4)
        .map((m, i) => ({
          ...m,
          medal: i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : ""
        }));

      renderScanResults(resultsEl, finalMatches);

      if (debugText) debugText.textContent = debugParts.join("\n\n");
      debugWrap?.classList.remove("hidden");

      setStatus(finalMatches.length ? "Scan complete." : "Scan complete — no confident matches.");
    }

    async function loadImage(file) {
      image = await fileToImage(file);
      imageBitmap = image;

      stageWrap?.classList.remove("hidden");
      fitImageToStage(image);
      clearSelectionOnly();
      redraw();
      setHint();
      setStatus(mode === "tap" ? "Tap 4 reward cards." : "Drag one wide box across the reward text row.");
    }

    function onPointerDown(evt) {
      if (!imageBitmap) return;

      evt.preventDefault();

      stage.setPointerCapture?.(evt.pointerId);

      const p = getRelativePointerPos(evt);
      pointerState.active = true;
      pointerState.startX = p.x;
      pointerState.startY = p.y;
      pointerState.currentX = p.x;
      pointerState.currentY = p.y;
      pointerState.moved = false;

      if (mode === "wide") {
        redraw();
      }
    }

    function onPointerMove(evt) {
      if (!pointerState.active) return;

      evt.preventDefault();

      const p = getRelativePointerPos(evt);
      pointerState.currentX = p.x;
      pointerState.currentY = p.y;

      const dx = p.x - pointerState.startX;
      const dy = p.y - pointerState.startY;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        pointerState.moved = true;
      }

      if (mode === "wide") {
        redraw();
      }
    }

    function onPointerUp(evt) {
      if (!pointerState.active) return;

      evt.preventDefault();

      const p = getRelativePointerPos(evt);
      pointerState.currentX = p.x;
      pointerState.currentY = p.y;

      if (mode === "tap") {
        if (!pointerState.moved) {
          if (tapPoints.length < 4) {
            tapPoints.push({ x: p.x, y: p.y });
            buildCropCanvasesFromTap();
            redraw();

            if (tapPoints.length === 4) {
              setStatus("4 taps captured. Now press Analyze crops.");
            } else {
              setStatus(`Tap captured (${tapPoints.length}/4).`);
            }
          }
        }
      } else {
        const rect = normalizeRect(
          pointerState.startX,
          pointerState.startY,
          pointerState.currentX,
          pointerState.currentY
        );

        if (rect.w < 30 || rect.h < 20) {
          pointerState.active = false;
          redraw();
          setStatus("Wide-box too small. Try again.");
          return;
        }

        wideRect = rect;
        buildCropCanvasesFromWideRect();
        redraw();
        setStatus("Wide-box captured. Now press Analyze crops.");
      }

      pointerState.active = false;
    }

    uploadBtn?.addEventListener("click", () => fileInput?.click());
    clearBtn?.addEventListener("click", clearAll);
    modeTapBtn?.addEventListener("click", () => setMode("tap"));
    modeWideBtn?.addEventListener("click", () => setMode("wide"));
    runBtn?.addEventListener("click", () => {
      analyzeCrops().catch((err) => {
        console.error(err);
        setStatus(`Scan failed: ${err.message || err}`);
      });
    });

    fileInput?.addEventListener("change", async (evt) => {
      const file = evt.target.files?.[0];
      if (!file) return;
      try {
        await loadImage(file);
      } catch (err) {
        console.error(err);
        setStatus("Could not load image.");
      }
    });

    stage.addEventListener("pointerdown", onPointerDown);
    stage.addEventListener("pointermove", onPointerMove);
    stage.addEventListener("pointerup", onPointerUp);
    stage.addEventListener("pointercancel", () => {
      pointerState.active = false;
      redraw();
    });

    window.addEventListener("resize", () => {
      if (!image) return;
      fitImageToStage(image);
      redraw();
      if (mode === "tap" && tapPoints.length) {
        buildCropCanvasesFromTap();
      } else if (mode === "wide" && wideRect) {
        buildCropCanvasesFromWideRect();
      }
    });

    setHint();
    clearAll();

    return {
      clear: clearAll
    };
  };
})();
