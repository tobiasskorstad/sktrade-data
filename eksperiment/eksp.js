const E = require("./exp.js"), fs = require("fs");
const PS = E.SYMS.map(s => E.prep(E.load(s)));
const allD = PS.flatMap(P => P.days.filter(x => x.ok).map(x => x.d)), D0 = Math.min(...allD), D1 = Math.max(...allD) + 1, SP = Math.round(D0 + (D1 - D0) * 0.6);
const iso = d => new Date(d * E.DAY).toISOString().slice(0, 10), f = v => (v * 100).toFixed(3);
console.log("periode", iso(D0), iso(D1 - 1), "deling", iso(SP));
const COST = { lim: { fee: 0.045, slip: 0.02, mk: 0.015, net: true }, mkt: { fee: 0.045, slip: 0.02, mk: null, net: true } };
const PAR = { pull: [0.25, 0.5, 0.75, 1, 1.5], fade: [0.5, 0.8, 1.2, 1.6], rsi: [5, 10, 20], pd: [0, 0.25], asia: [0], ny: [0], open: [0], mom: [8, 14.5, 18] };
const DIRS = ["long", "short", "both", "trend"], TFS = ["e2050", "e50", "e200", "none"];
const cfgs = [];
for (const st in PAR) for (const k of PAR[st]) for (const dir of DIRS) for (const tf of TFS) {
  const usesTf = dir == "trend" || st == "pull";
  if (!usesTf && tf != "e2050") continue; if (dir == "trend" && tf == "none") continue;
  if (st == "open" && dir == "both") continue; if (st == "pull" && dir == "both" && tf == "none") continue;
  for (const tp of [0.3, 0.5, 0.75, 1]) for (const sl of [0.5, 1, 2, 3, 0]) cfgs.push({ p: { st, k, dir, tf, cut: 20 }, o: { tp, sl, hold: 0 } });
}
console.log("trinn 1:", cfgs.length, "oppsett × 2 kostnader");
const res = [];
const t0 = Date.now();
for (const c of cfgs) for (const ck of ["lim", "mkt"]) {
  const tr = E.run(PS, c.p, { ...c.o, ...COST[ck] }, D0, D1);
  const a = tr.filter(t => t.d < SP), b = tr.filter(t => t.d >= SP);
  res.push({ ...c, ck, tr: E.st(a), te: E.st(b), all: E.st(tr), trades: tr });
}
console.log("tid", ((Date.now() - t0) / 1000).toFixed(0), "s");
const name = r => `${r.p.st}(${r.p.k}) ${r.p.dir}/${r.p.tf} tp${r.o.tp} sl${r.o.sl}${r.o.hold ? " h" + r.o.hold : ""}${r.uni ? " " + r.uni : ""}${r.o.tpA ? " ATR" : ""} ${r.ck}`;
const line = r => `${name(r).padEnd(46)} trening n${r.tr.n} ${f(r.tr.m)} t${r.tr.t.toFixed(1)} | test n${r.te.n} ${f(r.te.m)} t${r.te.t.toFixed(1)}`;
for (const ck of ["lim", "mkt"]) {
  const R = res.filter(r => r.ck == ck && r.tr.n >= 150);
  const posBoth = R.filter(r => r.tr.m > 0 && r.te.m > 0).length;
  console.log(`\n== ${ck}: ${R.length} oppsett med minst 150 handler i trening. Positiv i trening: ${R.filter(r => r.tr.m > 0).length}. Positiv i begge: ${posBoth}`);
  R.sort((a, b) => b.tr.t - a.tr.t).slice(0, 15).forEach(r => console.log(line(r)));
  // hvor mange av topp 50 i trening holder på test?
  const top = R.slice(0, 50); console.log(`topp 50 fra trening: snitt test ${f(top.reduce((s, r) => s + r.te.m, 0) / 50)}, positive på test ${top.filter(r => r.te.m > 0).length}/50`);
}
// Fordeling per strategi (lim): beste trening-t og snitt på test for topp 5
console.log("\nper strategi (lim, n≥150):");
for (const s in PAR) { const R = res.filter(r => r.ck == "lim" && r.p.st == s && r.tr.n >= 150).sort((a, b) => b.tr.t - a.tr.t).slice(0, 5);
  if (R.length) console.log(s.padEnd(5), "beste trening t", R[0].tr.t.toFixed(1), "topp5 test-snitt", f(R.reduce((x, r) => x + r.te.m, 0) / R.length), "beste:", name(R[0])) }

// Walk-forward: hvert år velges beste oppsett (høyest t) på de to foregående årene, og handles neste år
function wf(ck, minN) {
  const yrs = [2023, 2024, 2025, 2026], oos = [], picks = [];
  for (const y of yrs) { const a = Date.UTC(y - 2, 0, 1) / E.DAY, b = Date.UTC(y, 0, 1) / E.DAY, c = Date.UTC(y + 1, 0, 1) / E.DAY;
    let best = null; for (const r of res) { if (r.ck != ck) continue; const tr = r.trades.filter(t => t.d >= a && t.d < b); if (tr.length < minN) continue; const s = E.st(tr); if (!best || s.t > best.s.t) best = { r, s } }
    const nxt = best.r.trades.filter(t => t.d >= b && t.d < c); oos.push(...nxt); picks.push(`${y}: ${name(best.r)} (inn-t ${best.s.t.toFixed(1)}) → ${E.st(nxt).n} handler, ${f(E.st(nxt).m)}`) }
  const s = E.st(oos); console.log(`\nwalk-forward ${ck}: ${s.n} handler, snitt ${f(s.m)}, t ${s.t.toFixed(1)}, treff ${(s.w * 100).toFixed(0)} %, totalt ${(s.tot * 100).toFixed(0)} %`); picks.forEach(p => console.log("  " + p));
  return s;
}
const WF = { lim: wf("lim", 200), mkt: wf("mkt", 200) };
fs.writeFileSync("/home/claude/work/eksp1.json", JSON.stringify({ D0, D1, SP, res: res.map(({ trades, ...r }) => r), WF }));
// lagre topp 30 (lim) for trinn 2
fs.writeFileSync("/home/claude/work/topp.json", JSON.stringify(res.filter(r => r.ck == "lim" && r.tr.n >= 150).sort((a, b) => b.tr.t - a.tr.t).slice(0, 30).map(r => ({ p: r.p, o: r.o }))));
