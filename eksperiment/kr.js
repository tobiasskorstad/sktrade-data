const E=require("./exp.js");const PS=E.SYMS.map(s=>E.prep(E.load(s)));const J=require("./eksp1.json"),{D0,D1,SP}=J,f=v=>(v*100).toFixed(3);
const KR=["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","BNBUSDT"];const R=require("./eksp2.json").filter(r=>r.u=="krypto").slice(0,10);
const nm=r=>`${r.p.st}(${r.p.k}) ${r.p.dir}/${r.p.tf} tp${(+r.o.tp).toFixed(2)} sl${(+r.o.sl).toFixed(2)}${r.o.tpA?"×ATR":"%"} h${r.o.hold} cut${r.p.cut}`;
function degen(tr,fz){let p=0,fl=0,op=0;const fd=tr[0].d,ld=tr.at(-1).d;for(let s=fd;s+365<=ld;s+=7){let eq=1,res=0;for(const t of tr){if(t.d<s)continue;if(t.d>=s+365)break;
 if(eq*(1-t.mae*fz)<=0.97||t.mae*fz>=0.02){res=-1;break}eq*=1+t.r*fz;if(eq>=1.08){res=1;break}}res>0?p++:res<0?fl++:op++}const n=p+fl+op;return `${Math.round(p/n*100)}/${Math.round(fl/n*100)}/${Math.round(op/n*100)}`}
for(const r of R){for(const mk of [0.015,null]){const tr=E.run(PS,r.p,{...r.o,fee:0.045,slip:0.02,mk,net:true},D0,D1,KR);const a=E.st(tr.filter(t=>t.d<SP)),b=E.st(tr.filter(t=>t.d>=SP));
 const Y={};tr.forEach(t=>{const y=new Date(t.d*E.DAY).getUTCFullYear();(Y[y]=Y[y]||[]).push(t)});const worst=Math.min(...tr.map(t=>t.r)),mae=Math.max(...tr.map(t=>t.mae));
 console.log(nm(r).padEnd(50),mk?"lim":"mkt","tr",a.n,f(a.m),"te",b.n,f(b.m),"t"+b.t.toFixed(1),"år:",Object.keys(Y).map(y=>y.slice(2)+":"+f(E.st(Y[y]).m)).join(" "),"verst",f(worst),"maxMAE",f(mae),"degen0.5",degen(tr,0.5),"0.25",degen(tr,0.25))}}
