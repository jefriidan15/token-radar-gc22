# token-radar-gc22

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/jefriidan15/token-radar-gc22/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/jefriidan15/token-radar-gc22/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for make.fun's `token-radar-01` bounty. It reads the sealed DefiLlama snapshot, scores every protocol that records no token, and ranks them by the value a token would carry if the protocol's record stayed as it is.

The model is `radar-2`: implied value = TVL × 0.30 × growth (seven-day TVL change, clamped to −50%…+150% and weighted 0.60) × maturity (logarithmic in days tracked, floored at 0.55) × breadth (1 + 0.04 per extra chain, at most +20%). The board holds all 40 watchlist protocols plus every other rankable pre-token protocol in the snapshot — 198 rows — and every row carries a seven-step farm plan (action, cost, time) built from that protocol's own category, chains, TVL and age. Protocols that already trade sit in a separate Live view at the market's own value, never in the ranking. Wrapped, staked and bridged products of tokens that already trade are kept out of the early radar under the same rule that built the watchlist. Nothing here forecasts whether or when a token is issued.

## Running it

Node 22 or later, standard library only — nothing to install. The sealed snapshot ships in the competition kit as `input/snapshot.json`.

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

That produces `out/board.json` (the ranked board), `out/data.js` (the dashboard's data), `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. The page loads `../data.js` relatively, so view it through a server rather than a bare file open:

```sh
python3 -m http.server 8130 --directory out
# open http://127.0.0.1:8130/dashboard/index.html
```

## Test evidence, from the end-to-end run

Snapshot as of 2026-11-14, DefiLlama public API, 758 protocols, $50,000,000 floor:

- `main.ts` exits 0 and reports `198 rows scored (158 early, 24 live set aside)`.
- `board.json`: 198 rows, ranks exactly 1–198, implied values never rising with rank, all 40 watchlist slugs covered, 198 distinct implied values, every row's 7 farm steps within 20–600 characters. Rank 1 is Steakhouse Financial at $839,855,757; rank 198 is Monarq at $873,106.
- Two runs into separate directories write byte-identical outputs (`diff -r` clean).
- Dashboard source is 3 files, 18,180 bytes — under the 65,536-byte dossier text cap — and names no network address in any attribute or import.
- Screenshots (Playwright + Chromium, 1440×900, zero console or page errors): `1-board.png` 162,202 bytes, `2-detail.png` 178,490 bytes, `3-filtered.png` 167,104 bytes — the board, the rank-1 detail view, and the Risk Curators filtered view.
- `dossier.json` is 696,609 bytes, schema `makefun/dossier/v1`, 3 images, written by `buildDossier` from `vendor/makefun-board.ts`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=2hsnx8we&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
