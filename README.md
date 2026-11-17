# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Vans2788/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Vans2788/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it ranks every pre-token protocol in a sealed DefiLlama snapshot by implied launch value and shows how to farm each one, as a static dashboard that renders with no network.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=46y02b1h&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

## The model (radar-2)

Implied value follows only from the snapshot's own figures, through live-token
comparables — not a flat multiple, and never a hard-coded list of names:

```
implied = TVL × categoryMultiple × growth × maturity × chainBreadth
```

- **categoryMultiple** — the median market-cap / TVL of live-token protocols in the
  same category, shrunk toward the all-category median (prior weight 3) and capped
  at 1.0×. A category with one live protocol does not set the multiple on its own.
  Categories with no live protocol take the market median (0.25×).
- **growth** — `1 + clamp(7d change, −60%, +120%) × 0.5`.
- **maturity** — `0.7 + min(age, 1095d) / 1095 × 0.45`; age is days from `listed_at`
  to the snapshot's fixed `as_of` date (never the wall clock); unknown age counts
  as 365 days.
- **chainBreadth** — `1 + 0.02 × min(chains − 1, 3)`.

## The board

- **227 rows**: all 40 watchlist slugs (the floor, never a ceiling) plus 187 other
  genuine launch candidates, whatever their TVL. The watchlist misses real candidates
  above its floor — a $2.8B risk curator, a $320M prediction market — so the radar
  ranks the whole candidate set.
- **Excluded**: exchanges; wrapped, staked and bridged assets (WBTC, staked-ETH
  receipts, bridge-wrapped BTC); versioned pools (names ending in V2, v3, 1.1);
  live-token protocols, which appear only in the Live tokens view at market value.
- Every row carries a **7-step farm plan** generated from its own category, chains,
  TVL and age: two different on-protocol actions, a weekly cadence, a hold sized to
  age, a points check that warns never to pay to claim, and a log plus unwind plan.

## The dashboard

`dashboard/` is a static page (index.html + app.css + app.js, no network, no
external assets) that loads `../data.js`. It has:

- the ranked board: search, category / chain filters, watchlist-only toggle,
  sortable columns, and a detail view per protocol with the full model breakdown
  and farm plan;
- a Live tokens view of the 24 largest live-token protocols at market value;
- a Model & sandbox view: the formula, the per-category comparables table, and
  sliders that re-price every row live (illustrative only — `board.json` always
  uses the published constants);
- deep links: `#/row/<slug>` opens a protocol, `#/cat/<category>` filters,
  `#/live` and `#/model` switch views.

## Files

- `main.ts` — entrypoint: snapshot in, board + dashboard + dossier out.
- `lib/model.ts` — the model, comparables, board builder and farm plans.
- `vendor/makefun-board.ts` — the kit's dossier library, copied verbatim.
- `dashboard/` — the static page. `screenshots/` — the three required views.
- `check.mjs` — local gate checker (board, dashboard, screenshots, dossier,
  determinism).

## Caveats

Implied value is a model of a hypothetical launch, not a price or a prediction.
A protocol is called "pre-token" when its snapshot record shows no market cap, no
CoinGecko id and no symbol — the snapshot records no token; this entry never
claims a protocol has none.
