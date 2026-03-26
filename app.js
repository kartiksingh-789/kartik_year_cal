/* ═══════════════════════════════════════════════════════════
   Year Progress — Wallpaper Generator
   ─────────────────────────────────────────────────────────
   Zero-dependency, canvas-based, modular renderer.
   Supports: ?width=1220&height=2712&export=1&api=1
   ═══════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  /* ─────────────────────────────────────────────────────
     §1  CONFIGURATION
     ───────────────────────────────────────────────────── */
  const CONFIG = Object.freeze({
    /* Defaults — overridden by query params */
    WIDTH: 1220,
    HEIGHT: 2712,

    /* Colour palette — matched to reference */
    BG: "#151515ff",
    DOT_PASSED: "#ffffff",
    DOT_CURRENT: "#F05A28",
    DOT_FUTURE: "#4a4a4a",
    GLOW_COLOR: "rgba(240,90,40,",    /* alpha appended at render */
    TEXT_ACCENT: "#F05A28",
    TEXT_MUTED: "rgba(255,255,255,0.70)",
    LABEL_COLOR: "#ffffff",

    /* Grid tuning */
    COLUMNS: 15,
    DOT_RATIO: 0.30,          /* dot radius = step × ratio (smaller dots) */
    GRID_PAD_X: 0.10,         /* horizontal padding (shrinks the whole grid and dots) */
    GRID_Y_BIAS: 0.75,        /* vertical centre bias (pushes grid lower for lockscreen clock) */

    /* Typography */
    FONT_BODY: "'Inter', system-ui, sans-serif",
    FONT_MONO: "'JetBrains Mono', 'SF Mono', monospace",
  });

  /* ─────────────────────────────────────────────────────
     §2  DATE INTELLIGENCE
     ───────────────────────────────────────────────────── */

  /** @returns {boolean} */
  function isLeapYear(y) {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  }

  /** @returns {number} 365 or 366 */
  function daysInYear(y) {
    return isLeapYear(y) ? 366 : 365;
  }

  /** 1‑indexed day of the year */
  function getDayOfYear(date = new Date()) {
    const start = new Date(date.getFullYear(), 0, 0);
    return Math.floor((date - start) / 86_400_000);
  }

  /** Day of the month (1–31) */
  function getDayOfMonth(date = new Date()) {
    return date.getDate();
  }

  /* ─────────────────────────────────────────────────────
     §3  QUERY-PARAM PARSING
     ───────────────────────────────────────────────────── */
  function parseParams() {
    const p = new URLSearchParams(window.location.search);
    return {
      width: parseInt(p.get("width"), 10) || CONFIG.WIDTH,
      height: parseInt(p.get("height"), 10) || CONFIG.HEIGHT,
      autoExport: p.has("export") || p.has("api"),
      apiMode: p.has("api"),
    };
  }

  /* ─────────────────────────────────────────────────────
     §4  GRID GEOMETRY
     ───────────────────────────────────────────────────── */

  /**
   * Compute all grid metrics for a given canvas size.
   * @returns {{ cols, rows, dotR, step, ox, oy }}
   */
  function computeGrid(W, H, totalDays) {
    const cols = CONFIG.COLUMNS;
    const rows = Math.ceil(totalDays / cols);

    const usableW = W * (1 - CONFIG.GRID_PAD_X * 2);
    const step = usableW / cols;
    const dotR = Math.max(3, step * CONFIG.DOT_RATIO);

    const gridW = cols * step;
    const gridH = rows * step;

    const ox = (W - gridW) / 2 + step / 2;
    const oy = (H - gridH) * CONFIG.GRID_Y_BIAS + step / 2;

    return { cols, rows, dotR, step, gridW, gridH, ox, oy };
  }

  /* ─────────────────────────────────────────────────────
     §5  RENDERING — GRID
     ───────────────────────────────────────────────────── */

  /**
   * Draw the full dot grid onto `ctx`.
   */
  function drawGrid(ctx, W, H, grid, today, dateOfMonth, totalDays) {
    const { cols, dotR, step, ox, oy } = grid;

    for (let i = 0; i < totalDays; i++) {
      const dayNum = i + 1;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = ox + col * step;
      const cy = oy + row * step;

      if (dayNum < today) {
        /* ── passed ─────────────────────────────────── */
        ctx.beginPath();
        ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
        ctx.fillStyle = CONFIG.DOT_PASSED;
        ctx.fill();

      } else if (dayNum === today) {
        /* ── current day: glow → dot → label ────────── */
        drawCurrentDot(ctx, cx, cy, dotR, dateOfMonth);

      } else {
        /* ── future ─────────────────────────────────── */
        ctx.beginPath();
        ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
        ctx.fillStyle = CONFIG.DOT_FUTURE;
        ctx.fill();
      }
    }
  }

  /**
   * Render the highlighted current-day dot with glow and date overlay.
   */
  function drawCurrentDot(ctx, cx, cy, dotR, dateOfMonth) {
    /* Outer glow layers (3 passes for smooth falloff) */
    const glowSteps = [
      { r: dotR * 4.0, a: 0.06 },
      { r: dotR * 2.5, a: 0.12 },
      { r: dotR * 1.6, a: 0.22 },
    ];
    for (const { r, a } of glowSteps) {
      const grad = ctx.createRadialGradient(cx, cy, dotR * 0.3, cx, cy, r);
      grad.addColorStop(0, CONFIG.GLOW_COLOR + a + ")");
      grad.addColorStop(1, CONFIG.GLOW_COLOR + "0)");
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    /* Solid accent dot */
    ctx.beginPath();
    ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
    ctx.fillStyle = CONFIG.DOT_CURRENT;
    ctx.fill();

    /* Date-of-month label */
    const fontSize = dateOfMonth > 9
      ? Math.max(8, dotR * 1.0)
      : Math.max(9, dotR * 1.2);
    ctx.fillStyle = CONFIG.LABEL_COLOR;
    ctx.font = `700 ${fontSize}px ${CONFIG.FONT_MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(dateOfMonth), cx, cy + 0.5);
  }

  /* ─────────────────────────────────────────────────────
     §6  RENDERING — FOOTER TEXT
     ───────────────────────────────────────────────────── */

  /**
   * Draw the progress text at the bottom.
   *   "280d left  ·  23%"
   *    ^^^^^^^^        ^^^
   *    accent          muted
   */
  function renderText(ctx, W, H, grid, remaining, pct) {
    const footY = grid.oy + grid.gridH + grid.step * 0.69;

    const size = Math.max(22, Math.min(38, W * 0.028));
    ctx.textBaseline = "top";

    const leftStr = `${remaining}d left`;
    const sepStr = "  ·  ";
    const pctStr = `${pct}%`;

    /* Measure widths */
    ctx.font = `600 ${size}px ${CONFIG.FONT_BODY}`;
    const leftW = ctx.measureText(leftStr).width;
    ctx.font = `400 ${size}px ${CONFIG.FONT_BODY}`;
    const sepW = ctx.measureText(sepStr).width;
    const pctW = ctx.measureText(pctStr).width;

    let x = (W - (leftW + sepW + pctW)) / 2;

    /* "280d left" — accent */
    ctx.font = `600 ${size}px ${CONFIG.FONT_BODY}`;
    ctx.fillStyle = CONFIG.TEXT_ACCENT;
    ctx.textAlign = "left";
    ctx.fillText(leftStr, x, footY);
    x += leftW;

    /* " · " — muted */
    ctx.font = `400 ${size}px ${CONFIG.FONT_BODY}`;
    ctx.fillStyle = CONFIG.TEXT_MUTED;
    ctx.fillText(sepStr, x, footY);
    x += sepW;

    /* "23%" — muted */
    ctx.fillText(pctStr, x, footY);
  }

  /* ─────────────────────────────────────────────────────
     §7  MAIN ORCHESTRATOR
     ───────────────────────────────────────────────────── */

  function generateWallpaper(canvas, ctx, W, H) {
    /* Crisp rendering */
    canvas.width = W;
    canvas.height = H;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    /* Background */
    ctx.fillStyle = CONFIG.BG;
    ctx.fillRect(0, 0, W, H);

    /* Date intelligence */
    const now = new Date();
    const year = now.getFullYear();
    const today = getDayOfYear(now);
    const dateOfMo = getDayOfMonth(now);
    const total = daysInYear(year);
    const remaining = total - today;
    const pct = Math.round((today / total) * 100);

    /* Grid */
    const grid = computeGrid(W, H, total);
    drawGrid(ctx, W, H, grid, today, dateOfMo, total);

    /* Footer */
    renderText(ctx, W, H, grid, remaining, pct);
  }

  /* ─────────────────────────────────────────────────────
     §8  EXPORT
     ───────────────────────────────────────────────────── */

  function exportAsPNG(canvas, filename) {
    const link = document.createElement("a");
    link.download = filename || `year-progress-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  /* ─────────────────────────────────────────────────────
     §9  INITIALISATION
     ───────────────────────────────────────────────────── */

  function init() {
    const canvas = document.getElementById("wallpaperCanvas");
    const ctx = canvas.getContext("2d");
    const params = parseParams();
    const W = params.width;
    const H = params.height;

    /* Scale the visible canvas to fit viewport */
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scale = Math.min(vw / W, vh / H);
    canvas.style.width = W * scale + "px";
    canvas.style.height = H * scale + "px";

    /* Render */
    generateWallpaper(canvas, ctx, W, H);

    /* API / auto-export mode */
    if (params.apiMode) {
      document.body.classList.add("api-mode");
    }
    if (params.autoExport) {
      exportAsPNG(canvas);
    }

    /* Export button */
    const btnExport = document.getElementById("btnExport");
    if (btnExport) {
      btnExport.addEventListener("click", () => exportAsPNG(canvas));
    }

    /* Re-render on resize */
    window.addEventListener("resize", () => {
      const s = Math.min(window.innerWidth / W, window.innerHeight / H);
      canvas.style.width = W * s + "px";
      canvas.style.height = H * s + "px";
      generateWallpaper(canvas, ctx, W, H);
    });

    /* Schedule midnight re-render */
    scheduleNextDay(canvas, ctx, W, H);
  }

  function scheduleNextDay(canvas, ctx, W, H) {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const ms = tomorrow - now + 1000;
    setTimeout(() => {
      generateWallpaper(canvas, ctx, W, H);
      scheduleNextDay(canvas, ctx, W, H);
    }, ms);
  }

  /* ── Go ─────────────────────────────────────────── */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
