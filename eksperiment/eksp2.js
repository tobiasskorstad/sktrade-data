const E=require("./exp.js"),fs=require("fs");
const PS=E.SYMS.map(s=>E.prep(E.load(s)));const J=require("./eksp1.json"),{D0,D1,SP}=J,f=v=>(v*100).toFixed(3);
const TOP=require("./topp.json");const UNI={alle:null,gull:["PAXGUSDT"],krypto:["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","BNBUSDT"],btceth:["BTCUSDT","ETHUSDT"]};
const C={fee:0.045,slip:0.02,mk:0.015,net:true};const res=[];
for(const c of TOP)for(const u in UNI)for(const hold of [0,8])for(const cut of [12,20])for(const atr of [0,1]){
 const o={...c.o,hold,...C};if(atr){o.tpA=1;o.tp=c.o.tp/100/0.03;o.slA=1;o.sl=c.o.sl/100/0.03} // samme nivå ved 3 % ATR
 const p={...c.p,cut};const tr=E.run(PS,p,o,D0,D1,UNI[u]);const a=E.st(tr.filter(t=>t.d<SP)),b=E.st(tr.filter(t=>t.d>=SP));res.push({p,o,u,a,b,tr})}
const R=res.filter(r=>r.a.n>=150).sort((x,y)=>y.a.t-x.a.t);
console.log("trinn 2:",res.length,"oppsett, med n≥150:",R.length);
const nm=r=>`${r.p.st}(${r.p.k}) ${r.p.dir}/${r.p.tf} tp${(+r.o.tp).toFixed(2)} sl${(+r.o.sl).toFixed(2)}${r.o.tpA?"×ATR":"%"} h${r.o.hold} cut${r.p.cut} ${r.u}`;
R.slice(0,20).forEach(r=>console.log(nm(r).padEnd(58),"trening",r.a.n,f(r.a.m),"t"+r.a.t.toFixed(1),"| test",r.b.n,f(r.b.m),"t"+r.b.t.toFixed(1)));
for(const u in UNI){const q=R.filter(r=>r.u==u).slice(0,10);console.log(u.padEnd(7),"topp10 trening-t",q.length?(q.reduce((s,r)=>s+r.a.t,0)/q.length).toFixed(1):"-","test-snitt",q.length?f(q.reduce((s,r)=>s+r.b.m,0)/q.length):"-","positive på test",q.filter(r=>r.b.m>0).length+"/"+q.length)}
for(const k of ["hold","cut","atr"]){for(const v of k=="hold"?[0,8]:k=="cut"?[12,20]:[0,1]){const q=R.filter(r=>(k=="hold"?r.o.hold:k=="cut"?r.p.cut:(r.o.tpA?1:0))==v).slice(0,10);console.log(k,v,"topp10 test-snitt",f(q.reduce((s,r)=>s+r.b.m,0)/q.length),"pos",q.filter(r=>r.b.m>0).length)}}
// Walk-forward over trinn 2-oppsettene
const yrs=[2023,2024,2025,2026],oos=[],picks=[];
for(const y of yrs){const a=Date.UTC(y-2,0,1)/E.DAY,b=Date.UTC(y,0,1)/E.DAY,c=Date.UTC(y+1,0,1)/E.DAY;let best=null;
 for(const r of res){const tr=r.tr.filter(t=>t.d>=a&&t.d<b);if(tr.length<200)continue;const s=E.st(tr);if(!best||s.t>best.s.t)best={r,s}}
 const nx=best.r.tr.filter(t=>t.d>=b&&t.d<c);oos.push(...nx);picks.push(`${y}: ${nm(best.r)} (inn-t ${best.s.t.toFixed(1)}) → ${nx.length}, ${f(E.st(nx).m)}`)}
const s=E.st(oos);console.log(`walk-forward trinn 2: ${s.n} handler, snitt ${f(s.m)}, t ${s.t.toFixed(1)}, totalt ${(s.tot*100).toFixed(0)} %`);picks.forEach(p=>console.log(" ",p));
// Gull alene i detalj: beste trening -> test, år for år
const G=R.filter(r=>r.u=="gull")[0];if(G){const Y={};G.tr.forEach(t=>{const y=new Date(t.d*E.DAY).getUTCFullYear();(Y[y]=Y[y]||[]).push(t)});console.log("gull-beste:",nm(G));for(const y in Y){const q=E.st(Y[y]);console.log(" ",y,q.n,f(q.m))}}
fs.writeFileSync("eksp2.json",JSON.stringify(Object.keys(UNI).flatMap(u=>R.filter(r=>r.u==u).slice(0,10)).map(({tr,...r})=>r)));
