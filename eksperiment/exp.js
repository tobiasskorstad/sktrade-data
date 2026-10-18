// Eksperiment: hurtigtrades med mange innstillinger, én handel per døgn.
// Velger på trening (før deling), sjekker på test, og walk-forward år for år.
const fs = require("fs"), zlib = require("zlib");
const DAY = 864e5;
const SYMS = ["PAXGUSDT", "BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT"];
const ema = (a, n) => { const k = 2 / (n + 1), o = []; let e = a[0]; for (let i = 0; i < a.length; i++) { e = i ? a[i] * k + e * (1 - k) : a[0]; o.push(e) } return o };

function load(s) {
  const rows = zlib.gunzipSync(fs.readFileSync(`/home/claude/hd/k15/${s}.csv.gz`)).toString().trim().split("\n");
  const n = rows.length, m = { s, t: new Float64Array(n), o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n) };
  rows.forEach((r, i) => { const a = r.split(","); m.t[i] = +a[0]; m.o[i] = +a[1]; m.h[i] = +a[2]; m.l[i] = +a[3]; m.c[i] = +a[4] });
  return m;
}
function prep(m) {
  const n = m.t.length, days = []; let i = 0;
  while (i < n) { const d = Math.floor(m.t[i] / DAY); let j = i; while (j + 1 < n && Math.floor(m.t[j + 1] / DAY) == d) j++;
    if (j - i + 1 >= 90) { let hi = -1e99, lo = 1e99; for (let k = i; k <= j; k++) { if (m.h[k] > hi) hi = m.h[k]; if (m.l[k] < lo) lo = m.l[k] } days.push({ d, a: i, b: j, o: m.o[i], h: hi, l: lo, c: m.c[j] }) }
    i = j + 1 }
  const C = days.map(x => x.c), e20 = ema(C, 20), e50 = ema(C, 50), e200 = ema(C, 200), tr = [];
  days.forEach((x, k) => { const pc = k ? days[k - 1].c : x.o; tr.push(Math.max(x.h - x.l, Math.abs(x.h - pc), Math.abs(x.l - pc)) / pc) });
  days.forEach((x, k) => { if (k < 200) { x.ok = false; return } x.ok = true; const p = k - 1;
    x.T = { e2050: C[p] > e50[p] && e20[p] > e50[p] ? 1 : C[p] < e50[p] && e20[p] < e50[p] ? -1 : 0, e50: C[p] > e50[p] ? 1 : -1, e200: C[p] > e200[p] ? 1 : -1, none: 0 };
    let s = 0; for (let q = k - 14; q < k; q++) s += tr[q]; x.atr = s / 14; x.ph = days[p].h; x.pl = days[p].l; x.pd = days[p].d == x.d - 1 });
  /* RSI(2) på 1 t */
  const rs = new Float64Array(n).fill(NaN); let ag = null, al = null, prev = null;
  for (let k = 0; k < n; k++) { if ((m.t[k] % 36e5) != 27e5) continue; const c = m.c[k];
    if (prev != null) { const ch = c - prev, g = ch > 0 ? ch : 0, l = ch < 0 ? -ch : 0; if (ag == null) { ag = g; al = l } else { ag = (ag + g) / 2; al = (al + l) / 2 } rs[k] = al == 0 ? 100 : 100 - 100 / (1 + ag / al) }
    prev = c }
  return { s: m.s, m, days, rs };
}
const off = (m, k, x) => Math.round((m.t[k] - x.d * DAY) / 9e5);

/* p: {st, dir, tf, k (dybde/terskel), cut (siste time for inngang, UTC)} */
function entry(P, x, p) {
  const m = P.m, H = m.h, L = m.l, O = m.o, tr = x.T[p.tf];
  const ok = side => p.dir == "both" || (p.dir == "long" && side > 0) || (p.dir == "short" && side < 0) || (p.dir == "trend" && tr == side);
  /* «trend»-filter brukt også på long/short når tf er satt: long krever tr ≥ 0 osv. ikke her – retningen styres av dir */
  const UP = ok(1), DN = ok(-1); if (!UP && !DN) return null;
  const at = o2 => { for (let k = x.a; k <= x.b; k++) if (off(m, k, x) >= o2) return k; return x.b + 1 };
  const end = Math.min(x.b, at(p.cut * 4) - 1);
  const stop = (k0, up, dn) => { for (let k = k0; k <= end; k++) { const u = up != null && H[k] >= up, d = dn != null && L[k] <= dn; if (u && d) return null;
    if (u) return { k, px: Math.max(up, O[k]), dir: 1, typ: "stop" }; if (d) return { k, px: Math.min(dn, O[k]), dir: -1, typ: "stop" } } return null };
  const lim = (k0, bl, sl) => { for (let k = k0; k <= end; k++) { const u = bl != null && L[k] <= bl, d = sl != null && H[k] >= sl; if (u && d) return null;
    if (u) return { k, px: Math.min(bl, O[k]), dir: 1, typ: "lim" }; if (d) return { k, px: Math.max(sl, O[k]), dir: -1, typ: "lim" } } return null };
  switch (p.st) {
    case "asia": case "ny": { const [r0, r1] = p.st == "asia" ? [0, 32] : [54, 58]; const a = at(r0), b = at(r1); if (b <= a || b > end) return null;
      let hi = -1e99, lo = 1e99; for (let k = a; k < b; k++) { if (H[k] > hi) hi = H[k]; if (L[k] < lo) lo = L[k] } return stop(b, UP ? hi : null, DN ? lo : null) }
    case "pd": if (!x.pd) return null; return stop(x.a, UP ? x.ph * (1 + p.k * x.atr) : null, DN ? x.pl * (1 - p.k * x.atr) : null);
    case "open": { const side = p.dir == "long" ? 1 : p.dir == "short" ? -1 : tr; if (!side) return null; return { k: x.a, px: O[x.a], dir: side, typ: "mkt" } }
    case "pull": { /* tilbakefall mot trenden: krever trend i den retningen */ const g = x.atr * p.k;
      return lim(x.a, tr >= 0 && UP && (p.tf == "none" || tr > 0) ? x.o * (1 - g) : null, tr <= 0 && DN && (p.tf == "none" || tr < 0) ? x.o * (1 + g) : null) }
    case "fade": { const g = x.atr * p.k; return lim(x.a, UP ? x.o * (1 - g) : null, DN ? x.o * (1 + g) : null) }
    case "mom": { const k = at(p.k * 4 || 58); if (k > end) return null; const side = m.c[k - 1] > x.o ? 1 : m.c[k - 1] < x.o ? -1 : 0; if (!side || !ok(side)) return null; return { k, px: O[k], dir: side, typ: "mkt" } }
    case "rsi": { const lo = p.k, hi = 100 - p.k; for (let k = x.a; k <= Math.min(end, x.b - 1); k++) { const r = P.rs[k]; if (isNaN(r)) continue;
      if (r < lo && UP) return { k: k + 1, px: O[k + 1], dir: 1, typ: "mkt" }; if (r > hi && DN) return { k: k + 1, px: O[k + 1], dir: -1, typ: "mkt" } } return null }
  }
  return null;
}
/* o: {tp, sl (i % eller ×ATR med tpA/slA), hold (timer, 0 = døgnslutt), fee, slip, mk, net} */
function run(PS, p, o, d0, d1, uni) {
  const tk = (o.fee + o.slip) / 100, mk = o.mk == null ? tk : o.mk / 100, out = [];
  const idx = PS.map(() => 0);
  for (let d = d0; d < d1; d++) {
    let best = null;
    for (let pi = 0; pi < PS.length; pi++) { if (uni && !uni.includes(PS[pi].s)) continue; const D = PS[pi].days; let j = idx[pi];
      while (j < D.length && D[j].d < d) j++; idx[pi] = j; if (j >= D.length || D[j].d != d || !D[j].ok) continue;
      const x = D[j], e = entry(PS[pi], x, p); if (!e || e.k > x.b) continue; const t = PS[pi].m.t[e.k]; if (!best || t < best.t) best = { t, pi, x, e } }
    if (!best) continue;
    const P = PS[best.pi], m = P.m, x = best.x, e = best.e, s = e.dir, ci = e.typ == "lim" ? mk : tk;
    const tpp = (o.tpA ? o.tp * x.atr : o.tp / 100) + (o.net ? ci + mk : 0), slp = o.slA ? o.sl * x.atr : o.sl / 100;
    const T = e.px * (1 + s * tpp), S = slp > 0 ? e.px * (1 - s * slp) : null, last = o.hold ? Math.min(x.b, e.k + o.hold * 4 - 1) : x.b;
    let ex = null, mae = 0;
    for (let k = e.k; k <= last; k++) { const adv = s > 0 ? (e.px - m.l[k]) / e.px : (m.h[k] - e.px) / e.px; if (adv > mae) mae = adv; const hs = S != null && (s > 0 ? m.l[k] <= S : m.h[k] >= S), ht = (k > e.k || e.typ == "mkt") && (s > 0 ? m.h[k] >= T : m.l[k] <= T);
      if (hs) { ex = { px: s > 0 ? Math.min(S, m.o[k]) : Math.max(S, m.o[k]), w: "stop" }; break } if (ht) { ex = { px: T, w: "mål" }; break } }
    if (!ex) ex = { px: m.c[last], w: "tid" };
    const g = s * (ex.px - e.px) / e.px; out.push({ d, s: P.s, r: g - ci - (ex.w == "mål" ? mk : tk), w: ex.w, mae: S != null ? Math.min(mae, slp) : mae, t0: best.t });
  }
  return out;
}
function st(tr) { const n = tr.length; if (!n) return { n: 0, m: 0, t: 0, w: 0, dd: 0 }; let s = 0, q = 0, w = 0, eq = 1, pk = 1, dd = 0;
  for (const t of tr) { s += t.r; q += t.r * t.r; if (t.r > 0) w++; eq *= 1 + t.r; pk = Math.max(pk, eq); dd = Math.max(dd, 1 - eq / pk) }
  const m = s / n, sd = Math.sqrt(Math.max(1e-12, (q - n * m * m) / Math.max(1, n - 1))); return { n, m, t: m / (sd / Math.sqrt(n)), w: w / n, dd, tot: eq - 1 } }

module.exports = { SYMS, load, prep, run, st, entry, DAY };
