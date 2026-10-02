// RuinLab - Monte Carlo trading risk simulator. Runs entirely in the browser.

const $ = (id) => document.getElementById(id);
const FIELDS = ["balance", "winrate", "rr", "risk", "trades", "sims", "ruin", "compound"];

const PRESETS = {
  scalper: { winrate: 62, rr: 0.7, risk: 1, trades: 500 },
  swing:   { winrate: 45, rr: 2.2, risk: 1.5, trades: 150 },
  gambler: { winrate: 45, rr: 1.5, risk: 10, trades: 200 },
  trend:   { winrate: 32, rr: 3.5, risk: 1, trades: 300 },
};

const fmt$ = (v) => "$" + Math.round(v).toLocaleString("en-US");
const pct = (v, d = 1) => {
  // never round 99.9% up to "100%" or 0.04% down to "0%"
  if (v > 0 && v < 1 && (v * 100).toFixed(d) % 100 === 0) d = Math.max(d, 1);
  return (v * 100).toFixed(d) + "%";
};

function readInputs() {
  return {
    balance: Math.max(100, +$("balance").value || 10000),
    p: +$("winrate").value / 100,
    rr: +$("rr").value,
    risk: +$("risk").value / 100,
    trades: Math.min(1000, Math.max(20, Math.round(+$("trades").value || 200))),
    sims: +$("sims").value,
    ruin: +$("ruin").value / 100,
    compound: $("compound").checked,
  };
}

function syncOutputs() {
  $("winrateOut").textContent = $("winrate").value + "%";
  $("rrOut").textContent = (+$("rr").value).toFixed(1) + " R";
  $("riskOut").textContent = (+$("risk").value).toFixed(2) + "%";
  $("ruinOut").textContent = $("ruin").value + "%";
}

// ---------- simulation ----------

function simulate(cfg) {
  const { balance, p, rr, risk, trades, sims, ruin, compound } = cfg;
  const ruinLevel = balance * (1 - ruin);
  const paths = new Float32Array(sims * (trades + 1));
  const finals = new Float64Array(sims);
  const maxDD = new Float64Array(sims);
  const streaks = new Uint16Array(sims);
  let ruined = 0;

  for (let s = 0; s < sims; s++) {
    let eq = balance, peak = balance, dd = 0, run = 0, longest = 0, dead = false;
    const base = s * (trades + 1);
    paths[base] = eq;
    for (let t = 1; t <= trades; t++) {
      if (!dead) {
        const stake = (compound ? eq : balance) * risk;
        if (Math.random() < p) { eq += stake * rr; run = 0; }
        else { eq -= stake; run++; if (run > longest) longest = run; }
        if (eq > peak) peak = eq;
        const d = (peak - eq) / peak;
        if (d > dd) dd = d;
        if (eq <= ruinLevel) { dead = true; ruined++; eq = Math.max(eq, 0); }
      }
      paths[base + t] = eq;
    }
    finals[s] = eq; maxDD[s] = dd; streaks[s] = longest;
  }
  return { paths, finals, maxDD, streaks, ruined, ruinLevel };
}

function quantile(sorted, q) {
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// Percentile bands, sampled at up to 200 points along the x axis.
function bands(paths, sims, trades) {
  const steps = Math.min(trades, 200);
  const out = [];
  const col = new Float64Array(sims);
  for (let k = 0; k <= steps; k++) {
    const t = Math.round((k / steps) * trades);
    for (let s = 0; s < sims; s++) col[s] = paths[s * (trades + 1) + t];
    col.sort();
    out.push({ t, p5: quantile(col, 0.05), p25: quantile(col, 0.25), p50: quantile(col, 0.5),
               p75: quantile(col, 0.75), p95: quantile(col, 0.95) });
  }
  return out;
}

// Exact probability of at least one run of >= k losses in n independent trades.
function streakProb(n, q, k) {
  let state = new Float64Array(k); // state[j] = P(current run is j, no k-run yet)
  state[0] = 1;
  let hit = 0;
  for (let i = 0; i < n; i++) {
    const next = new Float64Array(k);
    for (let j = 0; j < k; j++) {
      const m = state[j];
      if (!m) continue;
      next[0] += m * (1 - q);
      if (j + 1 === k) hit += m * q; else next[j + 1] += m * q;
    }
    state = next;
  }
  return hit;
}

// ---------- drawing ----------

function setupCanvas(c) {
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = +c.getAttribute("height");
  c.width = w * dpr; c.height = h * dpr; c.style.height = h + "px";
  const ctx = c.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function shortMoney(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return "$" + (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "k";
  return "$" + Math.round(v);
}

function drawFan(cfg, sim, b) {
  const { ctx, w, h } = setupCanvas($("fan"));
  const L = 56, R = 12, T = 10, B = 26;
  const top = Math.max(cfg.balance * 1.2, ...b.map((x) => x.p95)) * 1.08;
  const X = (t) => L + (t / cfg.trades) * (w - L - R);
  const Y = (v) => T + (1 - Math.min(Math.max(v, 0), top) / top) * (h - T - B);

  ctx.font = "11px JetBrains Mono, monospace";
  ctx.fillStyle = css("--muted");
  ctx.strokeStyle = css("--line");
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = (top / 4) * i, y = Y(v);
    ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke();
    ctx.textAlign = "right"; ctx.fillText(shortMoney(v), L - 6, y + 4);
  }
  ctx.textAlign = "center";
  for (let i = 0; i <= 4; i++) {
    const t = Math.round((cfg.trades / 4) * i);
    ctx.fillText(t === 0 ? "trade 0" : t, X(t), h - 8);
  }

  // a handful of real individual paths, faint
  const n = Math.min(40, cfg.sims);
  ctx.lineWidth = 1;
  for (let s = 0; s < n; s++) {
    const base = s * (cfg.trades + 1);
    const ruined = sim.paths[base + cfg.trades] <= sim.ruinLevel;
    ctx.strokeStyle = ruined ? "rgba(244,100,111,0.22)" : "rgba(230,235,245,0.09)";
    ctx.beginPath();
    for (let t = 0; t <= cfg.trades; t++) {
      const x = X(t), y = Y(sim.paths[base + t]);
      t ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }

  const band = (lo, hi, color) => {
    ctx.fillStyle = color; ctx.beginPath();
    b.forEach((p, i) => (i ? ctx.lineTo(X(p.t), Y(p[hi])) : ctx.moveTo(X(p.t), Y(p[hi]))));
    for (let i = b.length - 1; i >= 0; i--) ctx.lineTo(X(b[i].t), Y(b[i][lo]));
    ctx.closePath(); ctx.fill();
  };
  band("p5", "p95", "rgba(91,140,255,0.18)");
  band("p25", "p75", "rgba(91,140,255,0.30)");

  ctx.strokeStyle = css("--green"); ctx.lineWidth = 2.5; ctx.beginPath();
  b.forEach((p, i) => (i ? ctx.lineTo(X(p.t), Y(p.p50)) : ctx.moveTo(X(p.t), Y(p.p50))));
  ctx.stroke();

  ctx.strokeStyle = css("--red"); ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.moveTo(L, Y(sim.ruinLevel)); ctx.lineTo(w - R, Y(sim.ruinLevel)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = css("--red"); ctx.textAlign = "left";
  ctx.fillText("ruin " + shortMoney(sim.ruinLevel), L + 6, Y(sim.ruinLevel) - 5);
}

function drawDD(cfg, sim) {
  const { ctx, w, h } = setupCanvas($("ddHist"));
  const L = 8, R = 8, T = 8, B = 24, bins = 20;
  const counts = new Array(bins).fill(0);
  for (const d of sim.maxDD) counts[Math.min(bins - 1, Math.floor(d * bins))]++;
  const max = Math.max(...counts, 1);
  const bw = (w - L - R) / bins;
  counts.forEach((c, i) => {
    const bh = (c / max) * (h - T - B);
    const from = i / bins;
    ctx.fillStyle = from >= cfg.ruin ? css("--red") : from >= 0.25 ? css("--amber") : css("--green");
    ctx.globalAlpha = 0.85;
    ctx.fillRect(L + i * bw + 1, h - B - bh, bw - 2, bh);
  });
  ctx.globalAlpha = 1;
  ctx.fillStyle = css("--muted"); ctx.font = "11px JetBrains Mono, monospace"; ctx.textAlign = "center";
  [0, 25, 50, 75, 100].forEach((v) => ctx.fillText(v + "%", L + (v / 100) * (w - L - R), h - 8));
}

// ---------- output ----------

function render(cfg, sim) {
  const sorted = Float64Array.from(sim.finals).sort();
  const dd = Float64Array.from(sim.maxDD).sort();
  const st = Uint16Array.from(sim.streaks).sort();
  // rounded so a break-even system reads as exactly 0, not +0.00000000000001
  const expectancy = Math.round((cfg.p * cfg.rr - (1 - cfg.p)) * 1e6) / 1e6; // in R per trade
  const kelly = Math.round((cfg.p - (1 - cfg.p) / cfg.rr) * 1e6) / 1e6;       // optimal fraction
  const ruinP = sim.ruined / cfg.sims;
  const profitP = sorted.filter((v) => v > cfg.balance).length / cfg.sims;
  const median = quantile(sorted, 0.5);
  const breakeven = 1 / (1 + cfg.rr);

  let cls, head, body;
  if (expectancy <= 0) {
    cls = "bad"; head = expectancy < 0 ? "No edge: this system loses money on average." : "No edge: this system only breaks even, before fees.";
    body = `At ${cfg.rr.toFixed(1)}R you need to win more than ${pct(breakeven)} of trades just to break even. You win ${pct(cfg.p, 0)}. No position size fixes a negative edge.`;
  } else if (ruinP > 0.2) {
    cls = "bad"; head = `Too much risk: ${pct(ruinP)} of futures hit ruin.`;
    body = `The edge is real (+${expectancy.toFixed(2)}R per trade) but ${pct(cfg.risk, 2)} per trade is too big a bet for it. Try lowering the risk slider.`;
  } else if (ruinP > 0.03 || quantile(dd, 0.5) > 0.3) {
    cls = "warn"; head = "Profitable, but the ride will hurt.";
    body = `${pct(ruinP)} of runs hit ruin and the typical run has a ${pct(quantile(dd, 0.5), 0)} drawdown at some point. Most traders abandon a system during drawdowns like that.`;
  } else {
    cls = "good"; head = "Survivable system.";
    body = `Positive edge (+${expectancy.toFixed(2)}R per trade), ruin in only ${pct(ruinP)} of runs, and ${pct(profitP, 0)} of futures finish in profit after ${cfg.trades} trades.`;
  }
  $("verdict").className = "verdict " + cls;
  $("verdict").innerHTML = `<b>${head}</b>${body}`;

  const kellyNote = kelly <= 0 ? "no positive bet size"
    : cfg.risk > kelly ? `you bet ${(cfg.risk / kelly).toFixed(1)}× Kelly (overbetting)`
    : `you bet ${(cfg.risk / kelly).toFixed(2)}× Kelly`;
  const stats = [
    ["Edge per trade", (expectancy > 0 ? "+" : "") + expectancy.toFixed(2) + "R", expectancy > 0 ? "pos" : "neg", `break-even win rate ${pct(breakeven)}`],
    ["Risk of ruin", pct(ruinP), ruinP > 0.2 ? "neg" : ruinP > 0.03 ? "amb" : "pos", `down ${pct(cfg.ruin, 0)} from start`],
    ["Chance of profit", pct(profitP, 0), profitP >= 0.6 ? "pos" : profitP >= 0.4 ? "amb" : "neg", `after ${cfg.trades} trades`],
    ["Median final balance", fmt$(median), median >= cfg.balance ? "pos" : "neg", `5%: ${fmt$(quantile(sorted, 0.05))} · 95%: ${fmt$(quantile(sorted, 0.95))}`],
    ["Typical worst drawdown", pct(quantile(dd, 0.5), 0), quantile(dd, 0.5) > 0.3 ? "neg" : quantile(dd, 0.5) > 0.15 ? "amb" : "pos", `1 in 20 runs: ${pct(quantile(dd, 0.95), 0)}`],
    ["Longest losing streak", quantile(st, 0.5).toFixed(0) + " in a row", "amb", `bad luck (95%): ${quantile(st, 0.95).toFixed(0)}`],
    ["Kelly bet size", kelly > 0 ? pct(kelly) : "—", cfg.risk > kelly ? "neg" : "pos", kellyNote],
  ];
  $("stats").innerHTML = stats.map(([k, v, c, s]) =>
    `<div class="stat"><div class="k">${k}</div><div class="v ${c}">${v}</div><div class="s">${s}</div></div>`).join("");

  $("streakN").textContent = cfg.trades;
  const rows = [];
  for (const k of [3, 5, 7, 10, 12, 15, 20]) {
    const pr = streakProb(cfg.trades, 1 - cfg.p, k);
    rows.push(`<tr><td>${k} losses</td><td><div class="bar"><i style="width:${(pr * 100).toFixed(1)}%"></i></div></td><td>${pr > 0.999 ? "≈100%" : pct(pr)}</td></tr>`);
  }
  $("streaks").innerHTML = rows.join("");

  drawFan(cfg, sim, bands(sim.paths, cfg.sims, cfg.trades));
  drawDD(cfg, sim);
}

let last = null;
function run() {
  syncOutputs();
  const cfg = readInputs();
  const sim = simulate(cfg);
  last = { cfg, sim };
  render(cfg, sim);
}

// ---------- share links (settings live in the URL hash, nothing personal) ----------

function toHash() {
  const p = new URLSearchParams();
  for (const f of FIELDS) p.set(f, $(f).type === "checkbox" ? ($(f).checked ? 1 : 0) : $(f).value);
  return "#" + p.toString();
}
function fromHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  for (const f of FIELDS) {
    if (!p.has(f)) continue;
    if ($(f).type === "checkbox") $(f).checked = p.get(f) === "1"; else $(f).value = p.get(f);
  }
}

$("share").addEventListener("click", async () => {
  history.replaceState(null, "", toHash());
  try { await navigator.clipboard.writeText(location.href); $("share").textContent = "Link copied ✓"; }
  catch { $("share").textContent = "Link is in the address bar"; }
  setTimeout(() => ($("share").textContent = "Copy share link"), 1800);
});

document.querySelectorAll("[data-preset]").forEach((btn) =>
  btn.addEventListener("click", () => {
    for (const [k, v] of Object.entries(PRESETS[btn.dataset.preset])) $(k).value = v;
    run();
  }));

$("run").addEventListener("click", run);
document.querySelectorAll(".inputs input, .inputs select").forEach((el) => {
  el.addEventListener("input", syncOutputs);
  el.addEventListener("change", run);
});
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => last && render(last.cfg, last.sim), 150);
});

fromHash();
run();
