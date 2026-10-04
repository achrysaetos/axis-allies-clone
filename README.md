# Axis & Allies 1942 Second Edition

A private, rules-complete clone of Axis & Allies 1942 Second Edition. It plays in the browser, hotseat or against a computer opponent.

## Run it

```bash
npm install
npm run dev
```

Open the printed local URL. Pick a human or the AI for each power, then start a game. The game autosaves in the browser. You can export and import save files.

## Rules source

The engine follows these sources, in priority order:

1. The Avalon Hill FAQ and errata for 1942 Second Edition (November 2014). It adds Honolulu as a 13th victory city, sets victory at 9 cities for the Axis and 10 for the Allies, and sets starting income at Germany 41 and United Kingdom 31.
2. The Hasbro rulebook for 1942 Second Edition (2021 printing).

Map adjacency, territory values and the starting setup come from TripleA's `world_war_ii_v5_1942` map. TripleA is a data source only, not a rules authority. `scripts/gen-data.ts` regenerates `src/data/*.json` from `vendor/triplea/`.

Optional rules from the rulebook are off by default and can be turned on when you start a game:

- Total victory. The winning side must hold all 13 victory cities.
- Turkish straits. No sea units may enter or leave sea zone 16.
- Strategic bombing escorts and interceptors.

## Layout

- `src/engine` is the pure rules engine. `apply(state, action)` returns a new state or an error. It never mutates its input.
- `src/ai` holds the computer opponents. `aiAction(state)` returns the next action for whoever must act.
- `src/ui` is the React interface.
- `test` holds behavior tests named after rulebook pages.
- `scripts` holds the data generator, the fuzzer, the mutation tester and the AI match runner.
- `docs/decisions.tsv` records design decisions with their evidence.

## Verify

```bash
npm test
```

```bash
npm run typecheck
```

The fuzzer plays random legal games and checks rule invariants after every action. Its arguments are the number of games, the maximum rounds and the first seed.

```bash
npx tsx scripts/fuzz.ts 100 10 1
```

Set `OPTIONAL=1` to fuzz with every optional rule on.

The mutation tester injects known rule defects into the engine and confirms the test suite catches each one.

```bash
npx tsx scripts/mutate.ts
```
