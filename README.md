# token-radar-gc22

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/jefriidan15/token-radar-gc22/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/jefriidan15/token-radar-gc22/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar — a dashboard that ranks pre-token protocols by the value a token would carry if the protocol's record stayed as it is. Model `radar-2`: implied value = TVL × 0.30 × growth (7-day TVL change, clamped −50%…+150%, weight 0.60) × maturity (logarithmic in days tracked, floor 0.55) × breadth (1 + 0.04 per extra chain, max +20%). The board ranks all 40 watchlist protocols plus every other rankable pre-token protocol in the sealed snapshot — 198 rows in all — each with a 7-step farm plan (action, cost, time) derived from its own category, chains, TVL and age. Protocols that already trade are kept apart in a separate Live view at the market's own value. Wrapped, staked and bridged products of tokens that already trade are excluded from the early radar under the same rule that built the watchlist. Nothing here predicts whether or when a token is issued.

## Run it

Node 22 or later, standard library only, nothing to install. The sealed snapshot comes from the competition kit (`input/snapshot.json`).

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

That writes `out/board.json` (the ranked board), `out/data.js` (the dashboard's data), `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. To view the dashboard, serve `out/` (the page loads `../data.js` relatively, so it needs a server, not a bare file open):

```sh
python3 -m http.server 8130 --directory out
# open http://127.0.0.1:8130/dashboard/index.html
```

## End-to-end test evidence

Run on the sealed snapshot (as of 2026-11-14, DefiLlama public API, 758 protocols, $50,000,000 floor):

- `main.ts` exits 0 and prints: `198 rows scored (158 early, 24 live set aside)`.
- `board.json`: 198 rows, ranks exactly 1–198, implied values non-increasing with rank, all 40 watchlist slugs covered, 198 distinct implied values, every row's 7 farm steps 20–600 characters. Rank 1: Steakhouse Financial, $839,855,757. Rank 198: Monarq, $873,106.
- Determinism: two runs into separate directories are byte-identical (`diff -r` clean).
- Dashboard: 3 files, 18,089 bytes of source (under the 65,536-byte dossier text cap). No network: no `http://` or `https://` in any attribute or import.
- Screenshots (Playwright, Chromium, 1440×900, zero console/page errors): `1-board.png` 162,202 bytes, `2-detail.png` 178,490 bytes, `3-filtered.png` 167,104 bytes — board, detail of rank 1, and the Risk Curators filtered view.
- `dossier.json`: 696,517 bytes, schema `makefun/dossier/v1`, 3 images, written by `buildDossier` from `vendor/makefun-board.ts`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=2hsnx8we&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
