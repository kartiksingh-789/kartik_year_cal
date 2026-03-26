/* ═══════════════════════════════════════════════════════════
   Year Progress — Node.js API Server
   ─────────────────────────────────────────────────────────
   Stateless PNG generator + static file server.
   
   Install:   npm install
   Run:       node server.js
   
   Endpoints:
     GET /                              → serves index.html (client UI)
     GET /generate?width=1220&height=2712  → returns PNG image directly
   
   MacroDroid / Shortcuts:
     Fetch  http://<ip>:3100/generate?width=1220&height=2712
     Save response as wallpaper. Done.
   ═══════════════════════════════════════════════════════════ */

const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");

let createCanvas;
try {
  createCanvas = require("@napi-rs/canvas").createCanvas;
} catch (e) {
  console.error("\n  ✖  Missing dependency: @napi-rs/canvas");
  console.error("     Run:  npm install\n");
  process.exit(1);
}

/* ─────────────────────────────────────────────────────
   §1  CONFIGURATION (mirror of client app.js)
   ───────────────────────────────────────────────────── */
const CFG = {
  BG: "#151515ff",
  DOT_PASSED: "#ffffff",
  DOT_CURRENT: "#F05A28",
  DOT_FUTURE: "#4a4a4a",
  GLOW: "rgba(240,90,40,",
  TEXT_ACCENT: "#F05A28",
  TEXT_MUTED: "rgba(255,255,255,0.70)",
  LABEL: "#ffffff",

  COLUMNS: 15,
  DOT_RATIO: 0.30,
  PAD_X: 0.10,
  Y_BIAS: 0.75,
};

const PORT = parseInt(process.env.PORT, 10) || 3100;

/* ─────────────────────────────────────────────────────
   §2  DATE INTELLIGENCE
   ───────────────────────────────────────────────────── */
function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInYear(y) {
  return isLeapYear(y) ? 366 : 365;
}

function getDayOfYear(d) {
  const s = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - s) / 86_400_000);
}

/* ─────────────────────────────────────────────────────
   §3  GRID GEOMETRY
   ───────────────────────────────────────────────────── */
function computeGrid(W, H, total) {
  const cols = CFG.COLUMNS;
  const rows = Math.ceil(total / cols);
  const step = (W * (1 - CFG.PAD_X * 2)) / cols;
  const dotR = Math.max(3, step * CFG.DOT_RATIO);
  const gridW = cols * step;
  const gridH = rows * step;
  const ox = (W - gridW) / 2 + step / 2;
  const oy = (H - gridH) * CFG.Y_BIAS + step / 2;
  return { cols, rows, dotR, step, gridW, gridH, ox, oy };
}

/* ─────────────────────────────────────────────────────
   §4  DRAW CURRENT DOT  (glow + accent + label)
   ───────────────────────────────────────────────────── */
function drawCurrentDot(ctx, cx, cy, dotR, dateOfMonth) {
  /* Glow layers */
  const glowSteps = [
    { r: dotR * 4.0, a: 0.06 },
    { r: dotR * 2.5, a: 0.12 },
    { r: dotR * 1.6, a: 0.22 },
  ];
  for (const { r, a } of glowSteps) {
    const gr = ctx.createRadialGradient(cx, cy, dotR * 0.3, cx, cy, r);
    gr.addColorStop(0, CFG.GLOW + a + ")");
    gr.addColorStop(1, CFG.GLOW + "0)");
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = gr;
    ctx.fill();
  }

  /* Solid dot — slightly larger to fit the label */
  ctx.beginPath();
  ctx.arc(cx, cy, dotR * 1.15, 0, Math.PI * 2);
  ctx.fillStyle = CFG.DOT_CURRENT;
  ctx.fill();

  /* Date-of-month label — scaled to fit inside dot */
  const labelSize = dateOfMonth > 9
    ? Math.max(10, dotR * 1.15)
    : Math.max(12, dotR * 1.35);
  ctx.fillStyle = CFG.LABEL;
  ctx.font = `bold ${Math.round(labelSize)}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(dateOfMonth), cx, cy + 1);
}

/* ─────────────────────────────────────────────────────
   §5  DRAW GRID
   ───────────────────────────────────────────────────── */
function drawGrid(ctx, grid, today, dateOfMonth, total) {
  const { cols, dotR, step, ox, oy } = grid;

  for (let i = 0; i < total; i++) {
    const dayNum = i + 1;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = ox + col * step;
    const cy = oy + row * step;

    if (dayNum < today) {
      ctx.beginPath();
      ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
      ctx.fillStyle = CFG.DOT_PASSED;
      ctx.fill();
    } else if (dayNum === today) {
      drawCurrentDot(ctx, cx, cy, dotR, dateOfMonth);
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
      ctx.fillStyle = CFG.DOT_FUTURE;
      ctx.fill();
    }
  }
}

/* ─────────────────────────────────────────────────────
   §6  FOOTER TEXT
   ───────────────────────────────────────────────────── */
function renderText(ctx, W, H, grid, remaining, pct) {
  const footY = grid.oy + grid.gridH + grid.step * 0.30;
  const sz = Math.max(28, Math.min(48, W * 0.032));

  const leftStr = `${remaining}d left`;
  const sepStr = "  \u00B7  ";  /* middle dot */
  const pctStr = `${pct}%`;

  ctx.font = `bold ${sz}px Arial`;
  ctx.textBaseline = "top";

  const leftW = ctx.measureText(leftStr).width;
  const sepW = ctx.measureText(sepStr).width;
  const pctW = ctx.measureText(pctStr).width;
  const totalW = leftW + sepW + pctW;

  let startX = (W - totalW) / 2;

  ctx.textAlign = "left";

  /* Draw accent part */
  ctx.fillStyle = CFG.TEXT_ACCENT;
  ctx.fillText(leftStr, startX, footY);

  /* Draw separator and pct */
  startX += leftW;
  ctx.fillStyle = CFG.TEXT_MUTED;
  ctx.fillText(sepStr, startX, footY);

  startX += sepW;
  ctx.fillText(pctStr, startX, footY);
}

/* ─────────────────────────────────────────────────────
   §7  GENERATE WALLPAPER → PNG Buffer
   ───────────────────────────────────────────────────── */
function generatePNG(W, H) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  /* Background */
  ctx.fillStyle = CFG.BG;
  ctx.fillRect(0, 0, W, H);

  /* Date data — Forced to Indian Standard Time (IST) */
  /* TEST MODE: Added +2 hours offset so midnight rolls over precisely at 10:00 PM IST */
  const offsetMs = 2 * 60 * 60 * 1000;
  const simulatedTime = new Date().getTime() + offsetMs;
  const istString = new Date(simulatedTime).toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  const now = new Date(istString);
  const year = now.getFullYear();
  const today = getDayOfYear(now);
  const dateOfMo = now.getDate();
  const total = daysInYear(year);
  const remaining = total - today;
  const pct = Math.round((today / total) * 100);

  /* Grid + text */
  const grid = computeGrid(W, H, total);
  drawGrid(ctx, grid, today, dateOfMo, total);
  renderText(ctx, W, H, grid, remaining, pct);

  return canvas.toBuffer("image/png");
}

/* ─────────────────────────────────────────────────────
   §8  STATIC FILE SERVER
   ───────────────────────────────────────────────────── */
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

function serveStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=60",
    });
    res.end(data);
  });
}

/* ─────────────────────────────────────────────────────
   §9  HTTP SERVER
   ───────────────────────────────────────────────────── */
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  /* ── API endpoint: /generate ─────────────────────── */
  if (pathname === "/generate") {
    const w = Math.min(4000, Math.max(100, parseInt(parsed.query.width, 10) || 1220));
    const h = Math.min(8000, Math.max(100, parseInt(parsed.query.height, 10) || 2712));

    console.log(`  → /generate  ${w}×${h}  [${new Date().toISOString()}]`);

    const png = generatePNG(w, h);

    res.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": png.length,
      "Content-Disposition": `inline; filename="year-progress-${new Date().toISOString().slice(0, 10)}.png"`,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
      "X-Generated-At": new Date().toISOString(),
    });
    res.end(png);
    return;
  }

  /* ── Static files ────────────────────────────────── */
  let filePath = pathname === "/" ? "/index.html" : pathname;
  filePath = path.join(__dirname, filePath);

  /* Security: prevent directory traversal */
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("403 Forbidden");
    return;
  }

  serveStatic(res, filePath);
});

/* ─────────────────────────────────────────────────────
   §10  START
   ───────────────────────────────────────────────────── */
server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════════╗
  ║   Year Progress — Wallpaper Generator API       ║
  ╠══════════════════════════════════════════════════╣
  ║                                                  ║
  ║  UI:   http://localhost:${PORT}/                    ║
  ║  API:  http://localhost:${PORT}/generate             ║
  ║         ?width=1220&height=2712                  ║
  ║                                                  ║
  ║  MacroDroid:                                     ║
  ║    Fetch http://<your-ip>:${PORT}/generate           ║
  ║    ?width=1220&height=2712                       ║
  ║    → Save response as wallpaper                  ║
  ║                                                  ║
  ╚══════════════════════════════════════════════════╝
  `);
});
