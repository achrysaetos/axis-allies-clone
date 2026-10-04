# Axis & Allies 1942 Second Edition

A private, rules-complete clone of Axis & Allies 1942 Second Edition. Two players share one screen: one plays the Allies (Soviet Union, United Kingdom, United States) and the other plays the Axis (Germany, Japan). Either side can also be handed to the computer.

## Run it

```bash
npm install
npm run dev
```

Open the printed local URL and press **Start new game**. The game autosaves in the browser after every action, so **Continue** on the start screen picks up where you left off. **Export save** in the ☰ menu saves the game to a file and **Import saved game** on the start screen loads one.

## How a turn plays

Each power's turn opens with a card that names the player, shows the money to spend, and recaps what the previous power did. Press **Start turn** or Enter, and the map centers on that power's capital. A hint line at the top of the map names the next step. The ☰ menu holds the game log (L), help (?), export and the main menu.

1. **Purchase.** Click a unit card in the tray at the bottom to buy one, and right-click to remove one. The tray shows the IPCs left and how many units your factories can place.
2. **Combat move.** Drag a piece onto a space to move its whole stack, or click a piece to pick up one unit and click a highlighted space. Planned attacks show their win chance on the map. **Undo** (Ctrl or Cmd+Z) takes back moves in this phase.
3. **Combat.** The first battle's dialog opens by itself, and clicking a battle space opens its dialog. Press **Roll dice** and answer its choices, or **Fight it out automatically**. Hit dice are marked in red. **Next** moves to the following battle.
4. **Noncombat move.** Move units that did not attack, and land every plane.
5. **Mobilize.** Drag a card from the tray onto a highlighted space to place your new units.

If ending a phase would lose planes, leave units unplaced, or skip buying, the game asks you to confirm first. Press **E** to end a phase from the keyboard.

## Rules source

The engine follows these sources, in priority order:

1. The Avalon Hill FAQ and errata for 1942 Second Edition (November 2014). It adds Honolulu as a 13th victory city, sets victory at 9 cities for the Axis and 10 for the Allies, and sets starting income at Germany 41 and United Kingdom 31.
2. The Hasbro rulebook for 1942 Second Edition (2021 printing).

Map adjacency, territory values and the starting setup come from TripleA's `world_war_ii_v5_1942` map. TripleA is a data source only, not a rules authority. `scripts/gen-data.ts` regenerates `src/data/*.json` from `vendor/triplea/`.

Optional rules from the rulebook are off by default and can be switched on from the start screen:

- Total victory. The winning side must hold all 13 victory cities.
- Turkish straits. No sea units may enter or leave sea zone 16.
- Strategic bombing escorts and interceptors.

## Layout

- `src/engine` is the pure rules engine. `apply(state, action)` returns a new state or an error. It never mutates its input.
- `src/ai` holds the computer opponent. `aiAction(state)` returns the next action for whoever must act. Its battle simulator also powers the win-chance preview.
- `src/ui` is the React interface. `npm run format` formats the code with Prettier.
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
