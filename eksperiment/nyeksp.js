// Samme eksperiment som for hele døgnet, men bare i NY-vinduet (0–100 min etter 09:30 New York-tid).
const N = require("./nyexp.js"), fs = require("fs");
const PS = N.loadAll(), DAY = N.DAY, st = N.st;
const allD = PS.flatMap(P => P.days.map(x => x.d)), D0 = Math.min(...allD), D1 = Math.max(...allD) + 1, SP = Math.round(D0 + (D1 - D0) * 0.6);
const iso = d => new Date(d * DAY).toISOString().slice(0, 10), f = v => (v * 100).toFixed(3);
const say = (...a) => console.log(...a);
say("periode", iso(D0), iso(D1 - 1), "deling", iso(SP), "hverdager per marked:", PS.map(P => P.s.replace("USDT", "") + " " + P.days.length).join(", "));
const COST = { lim: { fee: 0.045, slip: 0.02, mk: 0.015, net: true }, mkt: { fee: 0.045, slip: 0.02, mk: null, net: true }, null: { fee: 0, slip: 0, mk: 0, net: false } };
const PAR = { orb: [5, 15, 30], orbr: [5, 15, 30], mom: [5, 15, 30, 60], rev: [5, 15, 30, 60], on: [0, 0.3], onr: [0, 0.3], open: [0], pull: [0.1, 0.2, 0.3, 0.5], fade: [0.1, 0.2, 0.3, 0.5], pd: [0], rsi: [5, 10, 20] };
const NAVN = { orb: "Brudd på åpningsrange", orbr: "Falskt brudd på åpningsrange", mom: "Momentum fra åpning", rev: "Mot bevegelsen fra åpning", on: "Med nattens bevegelse", onr: "Mot nattens bevegelse", open: "Kjøp/salg ved åpning", pull: "Tilbakefall i trend", fade: "Fade utslag fra åpning", pd: "Gårsdagens topp/bunn", rsi: "RSI(2) på 5 min" };
const DIRS = ["long", "short", "both", "trend"], TFS = ["e2050", "e50", "e200", "none"];

/* Trinn 0: uten kostnader, finnes det noe å hente i vinduet? */
say("\n== Trinn 0: uten kostnader, mål 0,5 %, ingen stop, beste retning per oppsett");
const raw = [];
for (const s in PAR) for (const k of PAR[s]) for (const dir of ["long", "short", "both"]) {
  const tr = N.runNY(PS, { st: s, k, dir, tf: "e2050", cut: 100 }, { tp: 0.5, sl: 0, ...COST.null }, D0, D1);
  raw.push({ s, k, dir, ...st(tr) });
}
raw.sort((a, b) => b.t - a.t).slice(0, 12).forEach(r => say(`${r.s}(${r.k}) ${r.dir}`.padEnd(20), "n", r.n, "snitt", f(r.m), "t", r.t.toFixed(1), "treff", (r.w * 100).toFixed(0)));

/* Trinn 1: strategier × retning × trendfilter × mål × stop × kostnad */
const cfgs = [];
for (const s in PAR) for (const k of PAR[s]) for (const dir of DIRS) for (const tf of TFS) {
  const usesTf = dir == "trend" || s == "pull";
  if (!usesTf && tf != "e2050") continue; if (dir == "trend" && tf == "none") continue;
  if (s == "open" && dir == "both") continue; if (s == "pull" && dir == "both" && tf == "none") continue;
  for (const tp of [0.3, 0.5, 0.75, 1]) for (const sl of [0.25, 0.5, 1, 2, 0]) cfgs.push({ p: { st: s, k, dir, tf, cut: 100 }, o: { tp, sl } });
}
say(`\n== Trinn 1: ${cfgs.length} oppsett × 2 kostnader`);
const res = [], t0 = Date.now();
for (const c of cfgs) for (const ck of ["lim", "mkt"]) {
  const tr = N.runNY(PS, c.p, { ...c.o, ...COST[ck] }, D0, D1);
  res.push({ ...c, ck, tr: st(tr.filter(t => t.d < SP)), te: st(tr.filter(t => t.d >= SP)), all: st(tr), trades: tr });
}
say("tid", ((Date.now() - t0) / 1000).toFixed(0), "s");
const name = r => `${r.p.st}(${r.p.k}) ${r.p.dir}/${r.p.tf} tp${(+r.o.tp).toFixed(2)} sl${(+r.o.sl).toFixed(2)}${r.o.tpA ? "×ATR" : ""}${r.p.cut != 100 ? " cut" + r.p.cut : ""}${r.u ? " " + r.u : ""} ${r.ck || ""}`;
const line = r => `${name(r).padEnd(52)} trening n${r.tr.n} ${f(r.tr.m)} t${r.tr.t.toFixed(1)} | test n${r.te.n} ${f(r.te.m)} t${r.te.t.toFixed(1)}`;
const SUM = {};
for (const ck of ["lim", "mkt"]) {
  const R = res.filter(r => r.ck == ck && r.tr.n >= 150).sort((a, b) => b.tr.t - a.tr.t);
  const top50 = R.slice(0, 50), sl2 = R.filter(r => r.o.sl > 0 && r.o.sl <= 2), top20 = sl2.slice(0, 20);
  SUM[ck] = { n: R.length, posTr: R.filter(r => r.tr.m > 0).length, both: R.filter(r => r.tr.m > 0 && r.te.m > 0).length,
    top50m: top50.reduce((s, r) => s + r.te.m, 0) / top50.length, top50p: top50.filter(r => r.te.m > 0).length,
    sl2n: sl2.length, sl2both: sl2.filter(r => r.tr.m > 0 && r.te.m > 0).length, top20m: top20.reduce((s, r) => s + r.te.m, 0) / top20.length, top20p: top20.filter(r => r.te.m > 0).length,
    best: R.slice(0, 8).map(r => ({ n: name(r), tr: r.tr, te: r.te })) };
  say(`\n${ck}: ${R.length} oppsett med ≥150 handler i trening. Positiv i trening: ${SUM[ck].posTr}. Positiv i begge: ${SUM[ck].both}`);
  R.slice(0, 12).forEach(r => say(line(r)));
  say(`topp 50 fra trening → test: snitt ${f(SUM[ck].top50m)}, positive ${SUM[ck].top50p}/50`);
  say(`stop ≤2 %: ${sl2.length} oppsett, positiv i begge ${SUM[ck].sl2both}; topp 20 fra trening → test ${f(SUM[ck].top20m)}, positive ${SUM[ck].top20p}/20`);
}
say("\nper strategi (lim, n≥150, stop ≤2 %): beste trening-t og snitt på test for topp 5");
const PER = {};
for (const s in PAR) { const R = res.filter(r => r.ck == "lim" && r.p.st == s && r.tr.n >= 150 && r.o.sl > 0 && r.o.sl <= 2).sort((a, b) => b.tr.t - a.tr.t).slice(0, 5);
  if (!R.length) continue; PER[s] = { t: R[0].tr.t, te: R.reduce((x, r) => x + r.te.m, 0) / R.length, best: name(R[0]), trm: R[0].tr.m, tem: R[0].te.m };
  say(s.padEnd(5), "trening-t", R[0].tr.t.toFixed(1), "topp5 test", f(PER[s].te), "beste:", name(R[0])) }

function wf(pool, minN, lbl) {
  const oos = [], picks = [];
  for (const y of [2023, 2024, 2025, 2026]) { const a = Date.UTC(y - 2, 0, 1) / DAY, b = Date.UTC(y, 0, 1) / DAY, c = Date.UTC(y + 1, 0, 1) / DAY; let best = null;
    for (const r of pool) { const tr = r.trades.filter(t => t.d >= a && t.d < b); if (tr.length < minN) continue; const s = st(tr); if (!best || s.t > best.s.t) best = { r, s } }
    if (!best) continue; const nx = best.r.trades.filter(t => t.d >= b && t.d < c); oos.push(...nx); picks.push({ y, n: name(best.r), inT: best.s.t, nn: nx.length, m: st(nx).m }) }
  const s = st(oos); say(`\nwalk-forward ${lbl}: ${s.n} handler, snitt ${f(s.m)}, t ${s.t.toFixed(1)}, treff ${(s.w * 100).toFixed(0)} %, totalt ${(s.tot * 100).toFixed(0)} %`);
  picks.forEach(p => say(`  ${p.y}: ${p.n} (inn-t ${p.inT.toFixed(1)}) → ${p.nn}, ${f(p.m)}`)); return { ...s, picks };
}
const WF = { lim: wf(res.filter(r => r.ck == "lim"), 150, "lim"), mkt: wf(res.filter(r => r.ck == "mkt"), 150, "mkt"),
  lim2: wf(res.filter(r => r.ck == "lim" && r.o.sl > 0 && r.o.sl <= 2), 150, "lim, stop ≤2 %"), mkt2: wf(res.filter(r => r.ck == "mkt" && r.o.sl > 0 && r.o.sl <= 2), 150, "mkt, stop ≤2 %") };

/* Trinn 2: topp 30 (lim, stop ≤2 %) × marked × siste inngang × mål/stop i ATR */
const TOP = res.filter(r => r.ck == "lim" && r.tr.n >= 150 && r.o.sl > 0 && r.o.sl <= 2).sort((a, b) => b.tr.t - a.tr.t).slice(0, 30);
const UNI = { alle: null, gull: ["PAXGUSDT"], krypto: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT"], btceth: ["BTCUSDT", "ETHUSDT"] };
const res2 = [];
for (const c of TOP) for (const u in UNI) for (const cut of [30, 60, 100]) for (const atr of [0, 1]) for (const ck of ["lim", "mkt"]) {
  const o = { ...c.o, ...COST[ck] }; if (atr) { o.tpA = 1; o.tp = c.o.tp / 100 / 0.03; o.slA = 1; o.sl = c.o.sl / 100 / 0.03 }
  const p = { ...c.p, cut }, tr = N.runNY(PS, p, o, D0, D1, UNI[u]);
  res2.push({ p, o, u, ck, tr: st(tr.filter(t => t.d < SP)), te: st(tr.filter(t => t.d >= SP)), trades: tr });
}
say(`\n== Trinn 2: ${res2.length} oppsett`);
const S2 = {};
for (const ck of ["lim", "mkt"]) { const R = res2.filter(r => r.ck == ck && r.tr.n >= 100).sort((a, b) => b.tr.t - a.tr.t); S2[ck] = {};
  say(ck); R.slice(0, 8).forEach(r => say(line(r)));
  for (const u in UNI) { const q = R.filter(r => r.u == u).slice(0, 10); if (!q.length) continue; S2[ck][u] = { t: q.reduce((s, r) => s + r.tr.t, 0) / q.length, te: q.reduce((s, r) => s + r.te.m, 0) / q.length, p: q.filter(r => r.te.m > 0).length, n: q.length };
    say(" ", u.padEnd(7), "topp10 trening-t", S2[ck][u].t.toFixed(1), "test-snitt", f(S2[ck][u].te), "positive", S2[ck][u].p + "/" + q.length) }
  for (const cut of [30, 60, 100]) { const q = R.filter(r => r.p.cut == cut).slice(0, 10); say("  siste inngang", cut, "min: topp10 test", f(q.reduce((s, r) => s + r.te.m, 0) / q.length), "pos", q.filter(r => r.te.m > 0).length) }
  for (const a of [0, 1]) { const q = R.filter(r => (r.o.tpA ? 1 : 0) == a).slice(0, 10); say("  ", a ? "× ATR" : "fast %", "topp10 test", f(q.reduce((s, r) => s + r.te.m, 0) / q.length), "pos", q.filter(r => r.te.m > 0).length) } }
WF.t2lim = wf(res2.filter(r => r.ck == "lim"), 100, "trinn 2 lim"); WF.t2mkt = wf(res2.filter(r => r.ck == "mkt"), 100, "trinn 2 mkt");

/* Beste kandidat i detalj: høyest trening-t i trinn 2 med limit */
const B = res2.filter(r => r.ck == "lim" && r.tr.n >= 100).sort((a, b) => b.tr.t - a.tr.t)[0];
const Y = {}; B.trades.forEach(t => { const y = new Date(t.d * DAY).getUTCFullYear(); (Y[y] = Y[y] || []).push(t) });
const why = {}; B.trades.forEach(t => why[t.w] = (why[t.w] || 0) + 1);
const BEST = { n: name(B), tr: B.tr, te: B.te, yr: Object.keys(Y).map(y => [y, st(Y[y]).n, st(Y[y]).m]), why, worst: Math.min(...B.trades.map(t => t.r)), perWeek: B.trades.length / ((D1 - D0) / 7) };
say("\nbeste kandidat:", BEST.n, "år:", BEST.yr.map(([y, n, m]) => `${y}:${n}/${f(m)}`).join(" "), "utgang", JSON.stringify(why), "verst", f(BEST.worst), "per uke", BEST.perWeek.toFixed(1));

fs.writeFileSync("/home/claude/work/nyres.json", JSON.stringify({ D0, D1, SP, raw: raw.sort((a, b) => b.t - a.t).slice(0, 12), nCfg: cfgs.length, nCfg2: res2.length, SUM, PER, WF, S2, BEST, NAVN,
  rows: res.filter(r => r.o.sl > 0 && r.o.sl <= 2 && r.o.tp == 0.5 && r.p.dir != "trend").map(r => ({ st: r.p.st, k: r.p.k, dir: r.p.dir, tf: r.p.tf, sl: r.o.sl, ck: r.ck, n: r.all.n, m: +r.all.m.toFixed(6), w: +r.all.w.toFixed(4), trm: +r.tr.m.toFixed(6), tem: +r.te.m.toFixed(6) })) }));
