# Henter 5m-candles fra Binance spot for hovedlista, beholder 12:00–17:00 UTC (dekker NY-åpning 09:30 ET + 100 min, sommer og vinter).
import gzip, json, time, urllib.request, os, threading
SYMS = ["PAXGUSDT","BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","BNBUSDT"]
START = 1609459200000  # 2021-01-01 UTC
os.makedirs("k5", exist_ok=True)
def get(url):
    for i in range(6):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return json.load(r)
        except Exception as e:
            print("feil", e, flush=True); time.sleep(2 + i * 4)
    raise SystemExit("ga opp: " + url)
def one(s):
    rows, t = [], START
    while True:
        r = get(f"https://data-api.binance.vision/api/v3/klines?symbol={s}&interval=5m&limit=1000&startTime={t}")
        if not r: break
        for k in r:
            m = (k[0] // 60000) % 1440
            if 720 <= m < 1020: rows.append([k[0], k[1], k[2], k[3], k[4]])
        t = r[-1][0] + 1
        if len(r) < 1000: break
    with gzip.open(f"k5/{s}.csv.gz", "wt") as f:
        for k in rows: f.write(",".join(map(str, k)) + "\n")
    print(s, len(rows), flush=True)
th = [threading.Thread(target=one, args=(s,)) for s in SYMS]
[x.start() for x in th]; [x.join() for x in th]
missing = [s for s in SYMS if not os.path.exists(f"k5/{s}.csv.gz")]
if missing: raise SystemExit("mangler " + str(missing))
