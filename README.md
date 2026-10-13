# sktrade-data

Daglig markedshistorikk (fra 2008) for SizeProp-markeder utenom krypto: metaller, energi, hvete, indekser, valuta og aksjer. Brukes av backtestene i sktrade.html.

- `fetch_markets.py` henter data fra Yahoo Finance (Stooq som reserve).
- `.github/workflows/data.yml` kjører skriptet hver natt kl. 01:30 UTC og lagrer resultatet i `data/`.
- `data/index.json` viser hvilke markeder som finnes og når dataene sist ble oppdatert.

Repoet inneholder bare offentlige markedsdata, ingen nøkler eller kontoinformasjon.
