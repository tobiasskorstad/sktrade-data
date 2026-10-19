// Hurtigtrades i NY-vinduet: inngang og utgang innen 0–100 min etter NY-åpning (09:30 New York-tid).
// Dagskontekst (trend, ATR, gårsdagens topp/bunn, døgnåpning) fra 15m-data, selve vinduet fra 5m-data.
const fs = require("fs"), zlib = require("zlib"), E = require("./exp.js");
const DAY = 864e5, M5 = 3e5, WIN = 100;

/* NY-åpning i UTC: 13:30 når USA har sommertid (2. søndag i mars – 1. søndag i november), ellers 14:30 */
function nthSun(y, mo, n) { const d = new Date(Date.UTC(y, mo, 1)); const first = (7 - d.getUTCDay()) % 7; return Date.UTC(y, mo, 1 + first + 7 * (n - 1)) / DAY }
function nyOpen(d) { const y = new Date(d * DAY).getUTCFullYear(), a = nthSun(y, 2, 2), b = nthSun(y, 10, 1); return d * DAY + ((d >= a && d < b) ? 13.5 : 14.5) * 36e5 }

function load5(s, dir) {
  const rows = zlib.gunzipSync(fs.readFileSync(`${dir}/${s}.csv.gz`)).toString().trim().split("\n"), n = rows.length;
  const m = { t: new Float64Array(n), o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n) };
  rows.forEach((r, i) => { const a = r.split(","); m.t[i] = +a[0]; m.o[i] = +a[1]; m.h[i] = +a[2]; m.l[i] = +a[3]; m.c[i] = +a[4] });
  return m;
}
/* Bygger ett vindu per hverdag: 20 bars à 5 min fra åpningen, med dagskontekst */
function prepNY(P15, m5) {
  const byT = new Map(); for (let i = 0; i < m5.t.length; i++) byT.set(m5.t[i], i);
  /* RSI(2) på 5m, startet på nytt hver dag fra 12:00 UTC */
  const rs = new Float64Array(m5.t.length).fill(NaN); let ag = null, al = null, prev = null, pd = -1;
  for (let k = 0; k < m5.t.length; k++) { const d = Math.floor(m5.t[k] / DAY); if (d != pd) { ag = al = prev = null; pd = d } const c = m5.c[k];
    if (prev != null) { const ch = c - prev, g = ch > 0 ? ch : 0, l = ch < 0 ? -ch : 0; if (ag == null) { ag = g; al = l } else { ag = (ag + g) / 2; al = (al + l) / 2 } rs[k] = al == 0 ? 100 : 100 - 100 / (1 + ag / al) } prev = c }
  const days = [];
  for (const x of P15.days) {
    if (!x.ok) continue; const wd = new Date(x.d * DAY).getUTCDay(); if (wd == 0 || wd == 6) continue;
    const t0 = nyOpen(x.d), idx = [];
    for (let j = 0; j < WIN / 5; j++) { const i = byT.get(t0 + j * M5); if (i == null) break; idx.push(i) }
    if (idx.length < WIN / 5) continue;
    days.push({ d: x.d, t0, idx, T: x.T, atr: x.atr, ph: x.ph, pl: x.pl, pd: x.pd, dopen: x.o, p0: m5.o[idx[0]] });
  }
  return { s: P15.s, m: m5, rs, days };
}

/* p: {st, k, dir, tf, cut (minutter etter åpning for siste inngang)} → {j (bar i vinduet), px, dir, typ} */
function entryNY(P, x, p) {
  const m = P.m, I = x.idx, tr = x.T[p.tf], last = Math.min(I.length - 1, Math.floor(p.cut / 5) - 1);
  const ok = side => p.dir == "both" || (p.dir == "long" && side > 0) || (p.dir == "short" && side < 0) || (p.dir == "trend" && tr == side);
  const UP = ok(1), DN = ok(-1); if (!UP && !DN) return null;
  const stop = (j0, up, dn) => { for (let j = j0; j <= last; j++) { const i = I[j], u = up != null && m.h[i] >= up, d = dn != null && m.l[i] <= dn; if (u && d) return null;
    if (u) return { j, px: Math.max(up, m.o[i]), dir: 1, typ: "stop" }; if (d) return { j, px: Math.min(dn, m.o[i]), dir: -1, typ: "stop" } } return null };
  const lim = (j0, bl, sl) => { for (let j = j0; j <= last; j++) { const i = I[j], u = bl != null && m.l[i] <= bl, d = sl != null && m.h[i] >= sl; if (u && d) return null;
    if (u) return { j, px: Math.min(bl, m.o[i]), dir: 1, typ: "lim" }; if (d) return { j, px: Math.max(sl, m.o[i]), dir: -1, typ: "lim" } } return null };
  const mkt = (j, side) => j <= last && side && ok(side) ? { j, px: m.o[I[j]], dir: side, typ: "mkt" } : null;
  const rng = n => { let hi = -1e99, lo = 1e99; for (let j = 0; j < n; j++) { const i = I[j]; if (m.h[i] > hi) hi = m.h[i]; if (m.l[i] < lo) lo = m.l[i] } return [hi, lo] };
  switch (p.st) {
    case "orb": { const n = p.k / 5, [hi, lo] = rng(n); return stop(n, UP ? hi : null, DN ? lo : null) }
    case "orbr": { /* falskt brudd: kurs bryter åpningsrange og lukker tilbake inni → motsatt vei på neste bar */
      const n = p.k / 5, [hi, lo] = rng(n); let br = 0;
      for (let j = n; j < last; j++) { const i = I[j]; if (!br) { if (m.h[i] > hi) br = 1; else if (m.l[i] < lo) br = -1 }
        if (br > 0 && m.c[i] < hi) return mkt(j + 1, -1); if (br < 0 && m.c[i] > lo) return mkt(j + 1, 1) } return null }
    case "mom": case "rev": { const n = p.k / 5; if (n > last) return null; const mv = m.c[I[n - 1]] / x.p0 - 1, side = Math.sign(mv) * (p.st == "rev" ? -1 : 1); return mkt(n, side) }
    case "on": case "onr": { const mv = x.p0 / x.dopen - 1; if (Math.abs(mv) < p.k * x.atr) return null; return mkt(0, Math.sign(mv) * (p.st == "onr" ? -1 : 1)) }
    case "open": { const side = p.dir == "long" ? 1 : p.dir == "short" ? -1 : tr; return mkt(0, side) }
    case "pull": { const g = x.atr * p.k; return lim(0, UP && (p.tf == "none" || tr > 0) ? x.p0 * (1 - g) : null, DN && (p.tf == "none" || tr < 0) ? x.p0 * (1 + g) : null) }
    case "fade": { const g = x.atr * p.k; return lim(0, UP ? x.p0 * (1 - g) : null, DN ? x.p0 * (1 + g) : null) }
    case "pd": { if (!x.pd) return null; return stop(0, UP ? Math.max(x.ph, x.p0 * 1.0001) : null, DN ? Math.min(x.pl, x.p0 * 0.9999) : null) }
    case "rsi": { for (let j = 0; j < last; j++) { const r = P.rs[I[j]]; if (isNaN(r)) continue; if (r < p.k && UP) return mkt(j + 1, 1); if (r > 100 - p.k && DN) return mkt(j + 1, -1) } return null }
  }
  return null;
}

/* o: {tp, sl, tpA, slA, fee, slip, mk, net}. Alt lukkes ved slutten av vinduet (100 min). */
function runNY(PS, p, o, d0, d1, uni) {
  const tk = (o.fee + o.slip) / 100, mk = o.mk == null ? tk : o.mk / 100, out = [], idx = PS.map(() => 0);
  for (let d = d0; d < d1; d++) {
    let best = null;
    for (let pi = 0; pi < PS.length; pi++) { if (uni && !uni.includes(PS[pi].s)) continue; const D = PS[pi].days; let j = idx[pi];
      while (j < D.length && D[j].d < d) j++; idx[pi] = j; if (j >= D.length || D[j].d != d) continue;
      const x = D[j], e = entryNY(PS[pi], x, p); if (!e) continue; if (!best || e.j < best.e.j) best = { pi, x, e } }
    if (!best) continue;
    const P = PS[best.pi], m = P.m, x = best.x, e = best.e, s = e.dir, I = x.idx, ci = e.typ == "lim" ? mk : tk;
    const tpp = (o.tpA ? o.tp * x.atr : o.tp / 100) + (o.net ? ci + mk : 0), slp = o.sl > 0 ? (o.slA ? o.sl * x.atr : o.sl / 100) : 0;
    const T = e.px * (1 + s * tpp), S = slp > 0 ? e.px * (1 - s * slp) : null; let ex = null, mae = 0;
    for (let j = e.j; j < I.length; j++) { const i = I[j], adv = s > 0 ? (e.px - m.l[i]) / e.px : (m.h[i] - e.px) / e.px; if (adv > mae) mae = adv;
      const hs = S != null && (s > 0 ? m.l[i] <= S : m.h[i] >= S), ht = (j > e.j || e.typ == "mkt") && (s > 0 ? m.h[i] >= T : m.l[i] <= T);
      if (hs) { ex = { px: s > 0 ? Math.min(S, m.o[i]) : Math.max(S, m.o[i]), w: "stop" }; break } if (ht) { ex = { px: T, w: "mål" }; break } }
    if (!ex) ex = { px: m.c[I[I.length - 1]], w: "tid" };
    const g = s * (ex.px - e.px) / e.px;
    out.push({ d, s: P.s, dir: s, en: e.px, ex: ex.px, j: e.j, r: g - ci - (ex.w == "mål" ? mk : tk), w: ex.w, mae: S != null ? Math.min(mae, slp) : mae });
  }
  return out;
}

function loadAll(k15 = "/home/claude/hd/k15", k5 = "/home/claude/hd/k5") {
  return E.SYMS.map(s => prepNY(E.prep(E.load(s)), load5(s, k5)));
}
module.exports = { nyOpen, prepNY, entryNY, runNY, loadAll, st: E.st, SYMS: E.SYMS, DAY };
