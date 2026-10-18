# Henter 15m-candles fra Binance spot for hovedlista og lagrer som gzip-CSV.
import gzip, json, time, urllib.request, os
SYMS = ["PAXGUSDT","BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","BNBUSDT"]
START = int(time.mktime((2021,1,1,0,0,0,0,0,0))) * 1000
HOSTS = ["data-api.binance.vision", "api.binance.com"]
os.makedirs("k15", exist_ok=True)
def get(url):
    for i in range(5):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return json.load(r)
        except Exception as e:
            print("feil", e); time.sleep(2 + i * 3)
    raise SystemExit("ga opp: " + url)
for s in SYMS:
    rows, t = [], START
    while True:
        r = get(f"https://{HOSTS[0]}/api/v3/klines?symbol={s}&interval=15m&limit=1000&startTime={t}")
        if not r: break
        rows += [[k[0], k[1], k[2], k[3], k[4], k[5]] for k in r]
        t = r[-1][0] + 1
        if len(r) < 1000: break
    with gzip.open(f"k15/{s}.csv.gz", "wt") as f:
        for k in rows: f.write(",".join(map(str, k)) + "\n")
    print(s, len(rows))
