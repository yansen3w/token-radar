# Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/yansen3w/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/yansen3w/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token launch radar ranking 178 protocols by implied value. Built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

## What it does

It reads the sealed snapshot (758 protocols, 40 on the watchlist), scores every protocol by implied value — TVL-implied valuation against comparable live protocols, with a farm plan per row — and writes a 178-row board: the 40 watchlist protocols plus the 138 below-floor protocols with the most TVL. A velocity section adds 7-day TVL change tiers, weekly dollar gain, and a velocity watchlist (13 rows) from the snapshot's own `change_7d` and `tvl_usd` figures. Nothing is invented. The top 3 by implied value: Steakhouse Financial $586,181,107, Gauntlet $349,115,249, Veda $334,847,731.

The board ships with a static dashboard (`dashboard/`) that renders it offline, and three screenshots of that dashboard.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Requires Node 22 or later, standard library only — no install, no build, no API key.

## Entry

- `main.ts` — the entrypoint: reads the snapshot, builds the board, writes `board.json`, `data.js`, the dashboard, and `dossier.json`.
- `lib/model.ts` — the value model ("radar-2") plus the velocity analysis.
- `dashboard/` — the static dashboard page.
- `vendor/makefun-board.ts` — the kit's dashboard-dossier library, copied byte-for-byte.
- `screenshots/` — three screenshots of the dashboard.

## Links

- Bounty: [token-radar-01 on make.fun](https://make.fun/bounty/token-radar-01)
- Sign up: [make.fun](https://make.fun/r/30afxf5j)

## License

MIT — see [LICENSE](LICENSE).
