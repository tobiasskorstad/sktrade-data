"""Henter lang daglig historikk for SizeProp-markeder utenom krypto.

Kilde: Yahoo Finance (yfinance), med Stooq som reserve.
Skriver data/<KEY>.json (rader [dag, open, high, low, close], dag = dager siden 1970-01-01 UTC)
og data/index.json med oversikt. Kjøres hver natt av .github/workflows/data.yml.
"""
import csv
import datetime as dt
import io
import json
import os
import sys
import time
import urllib.request

START = "2008-01-01"
OUT = "data"

# key, navn, Yahoo, Stooq, gruppe, TradingView
MARKETS = [
    ("XAG", "Sølv", "SI=F", "xagusd", "metall", "TVC:SILVER"),
    ("COPPER", "Kobber", "HG=F", "hg.f", "metall", "COMEX:HG1!"),
    ("PLATINUM", "Platina", "PL=F", "xptusd", "metall", "TVC:PLATINUM"),
    ("WTI", "Olje (WTI)", "CL=F", "cl.f", "energi", "TVC:USOIL"),
    ("BRENT", "Olje (Brent)", "BZ=F", "cb.f", "energi", "TVC:UKOIL"),
    ("NATGAS", "Naturgass", "NG=F", "ng.f", "energi", "NYMEX:NG1!"),
    ("WHEAT", "Hvete", "ZW=F", "zw.f", "landbruk", "CBOT:ZW1!"),
    ("SP500", "S&P 500", "^GSPC", "^spx", "indeks", "SP:SPX"),
    ("NDX", "Nasdaq 100 (XYZ100)", "^NDX", "^ndx", "indeks", "NASDAQ:NDX"),
    ("EUR", "EUR/USD", "EURUSD=X", "eurusd", "valuta", "FX:EURUSD"),
    ("JPY", "JPY/USD", "JPYUSD=X", "jpyusd", "valuta", "FX_IDC:JPYUSD"),
    ("GOOGL", "Alphabet", "GOOGL", "googl.us", "aksje", "NASDAQ:GOOGL"),
    ("NVDA", "Nvidia", "NVDA", "nvda.us", "aksje", "NASDAQ:NVDA"),
    ("AMZN", "Amazon", "AMZN", "amzn.us", "aksje", "NASDAQ:AMZN"),
    ("TSLA", "Tesla", "TSLA", "tsla.us", "aksje", "NASDAQ:TSLA"),
    ("INTC", "Intel", "INTC", "intc.us", "aksje", "NASDAQ:INTC"),
    ("MSFT", "Microsoft", "MSFT", "msft.us", "aksje", "NASDAQ:MSFT"),
    ("BABA", "Alibaba", "BABA", "baba.us", "aksje", "NYSE:BABA"),
    ("HIMS", "Hims & Hers", "HIMS", "hims.us", "aksje", "NYSE:HIMS"),
]

# Bare for fanen Kvartalsrapporter (kursreaksjoner). Ikke med i index.json / Andre markeder.
KV_ONLY = [
    ("TTWO", "Take-Two", "TTWO", "ttwo.us", "aksje", "NASDAQ:TTWO"),
]

EPOCH = dt.date(1970, 1, 1)


def rnd(x):
    return float(f"{float(x):.6g}")


def clean(rows):
    """Sorterer, fjerner duplikater og ugyldige rader (f.eks. negativ oljepris april 2020)."""
    seen, out = set(), []
    for d, o, h, l, c in sorted(rows):
        if d in seen:
            continue
        vals = (o, h, l, c)
        if any(v is None or v != v or v <= 0 for v in vals):
            continue
        h, l = max(h, o, c), min(l, o, c)
        seen.add(d)
        out.append([d, rnd(o), rnd(h), rnd(l), rnd(c)])
    return out


def from_yahoo(ticker):
    import yfinance as yf

    df = yf.Ticker(ticker).history(start=START, interval="1d", auto_adjust=True)
    if df is None or df.empty:
        return []
    rows = []
    for ts, r in df.iterrows():
        d = (ts.date() - EPOCH).days
        rows.append((d, r["Open"], r["High"], r["Low"], r["Close"]))
    return rows


def from_stooq(sym):
    url = f"https://stooq.com/q/d/l/?s={sym}&i=d"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as f:
        txt = f.read().decode("utf-8", "replace")
    rows = []
    for r in csv.DictReader(io.StringIO(txt)):
        try:
            day = dt.date.fromisoformat(r["Date"])
            if day < dt.date.fromisoformat(START):
                continue
            rows.append(((day - EPOCH).days, float(r["Open"]), float(r["High"]), float(r["Low"]), float(r["Close"])))
        except (KeyError, ValueError):
            continue
    return rows


def main():
    os.makedirs(OUT, exist_ok=True)
    index, failed = [], []
    kv_keys = {m[0] for m in KV_ONLY}
    for key, name, yh, st, grp, tv in MARKETS + KV_ONLY:
        rows, src = [], ""
        for label, fn, arg in (("Yahoo", from_yahoo, yh), ("Stooq", from_stooq, st)):
            for attempt in range(3):
                try:
                    rows = clean(fn(arg))
                except Exception as e:  # noqa: BLE001
                    print(f"{key}: {label} feilet ({e})", file=sys.stderr)
                    rows = []
                if len(rows) > 300:
                    src = label
                    break
                time.sleep(3 * (attempt + 1))
            if src:
                break
        path = os.path.join(OUT, f"{key}.json")
        if not src:
            failed.append(key)
            if os.path.exists(path):  # behold forrige versjon
                with open(path) as f:
                    old = json.load(f)
                if key not in kv_keys:
                    index.append({k: old[k] for k in ("key", "name", "grp", "tv", "src", "first", "last", "n")})
            continue
        doc = {"key": key, "name": name, "grp": grp, "tv": tv, "src": src, "ticker": yh if src == "Yahoo" else st,
               "first": rows[0][0], "last": rows[-1][0], "n": len(rows), "rows": rows}
        with open(path, "w") as f:
            json.dump(doc, f, separators=(",", ":"))
        if key not in kv_keys:
            index.append({k: doc[k] for k in ("key", "name", "grp", "tv", "src", "first", "last", "n")})
        print(f"{key}: {len(rows)} dager fra {src}")
        time.sleep(1)
    with open(os.path.join(OUT, "index.json"), "w") as f:
        json.dump({"updated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"), "failed": failed,
                   "markets": index}, f, ensure_ascii=False, indent=1)
    print("Ferdig.", "Feilet: " + ", ".join(failed) if failed else "Alle OK.")


if __name__ == "__main__":
    main()
