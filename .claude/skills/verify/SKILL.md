---
name: verify
description: Launch and drive the Axis & Allies 1942 browser game (Vite + React on localhost:5173) the way a player does, and capture proof that a feature works. Use after any change to src/engine, src/ai or src/ui that a player could notice, to reproduce a reported game bug, or when asked to verify, run, or screenshot the game.
---

# Verify the Axis & Allies 1942 game

The game is a single-page web app. A player sets up a game, then clicks territories and panel buttons through five phases per turn. Every rule lives in the pure engine (`src/engine`), so a UI proof also proves engine behavior along the path the player took. Drive it with the built-in browser pane tools (`mcp__Claude_Browser__*`). The feature recipes are in [features/README.md](features/README.md).

Secondary surfaces have their own scripts and need no browser. `npm test` runs the behavior tests and `npx tsx scripts/fuzz.ts 50 10 1` runs random full games with invariant checks. `npx tsx scripts/ai-match.ts 10 15 1 ai` runs AI-vs-AI games, and `npx tsx scripts/mutate.ts` confirms the tests catch injected rule bugs. Use them for engine-only changes. Use this skill for anything a player sees.

## Launch

1. Run `npm install` once if `node_modules` is missing.
2. Generate the scenarios you need with `npx tsx scripts/verify/scenario.ts <name>`. Running it without a name lists every scenario. It writes `.verify/scenarios/<name>.json`, which the dev server serves at `/.verify/scenarios/<name>.json`.
3. Start the server with `preview_start` and `name: "game"`. The config is `.claude/launch.json`, which runs `npx vite --port 5173 --strictPort`. The server is ready when `preview_start` reports success and the tab title reads `Axis & Allies 1942`.
4. Call `resize_window` with width 1440 and height 900. The side panels need a desktop width.

For a second, isolated instance, add a launch configuration with another port (for example 5174). Saves live in `localStorage` per origin, so instances on different ports never share a game. Never drive a server this run did not start. The player's own game may be autosaved there.

## Doctor

Run `scripts/verify/doctor.sh` (set `PORT` for a non-default port). It is read-only. It checks that vite listens on the port, that its working directory is this checkout, that the page title is right, and which scenarios exist. It prints the git revision and `+dirty` for uncommitted changes. Run it first, and again whenever anything looks off. Do not drive on a `DOCTOR FAIL`.

## Drive

Stable handles, in order of preference:

- **Buttons by accessible name.** Run `read_page` with `filter: "interactive"` to list buttons and their `ref`s, then `computer` `left_click` with the `ref`. `find` matches accessible names, and buttons with a tooltip are named by the tooltip, not their visible text:
  - `End phase` and `End turn` are `End phase (E)` (the text changes, the name does not).
  - `Undo` is `Undo last move (Ctrl+Z)`, and `Export` is `Download this game as JSON`.
  - A battle's `Start` is `Fight this battle`, and a battle with a decision waiting is `A decision is pending`.
  - Names match visible text for `Start new game`, `Import saved game…`, `Menu`, `Skip`, `Confirm casualties`, `Auto`, `Press on`, `Bombard`, `Select all`, `Clear`, `Place 1` and `Place N` (N is a count).
  - Panels re-render a moment after a phase change. If a button is missing, wait half a second and list again.
- **Map territories by `data-space`.** Each territory and sea zone is an SVG element with `data-space="<name>"`, using the exact names from `src/data/map.json` (for example `France` or `8 Sea Zone`). The snippet below clicks a territory without needing it on screen.
- **Purchase steppers.** The `+` and `−` buttons sit in the row whose text starts with the unit name (`Infantry`, `Tank`, and so on).

Click a territory:

```js
const el = document.querySelector('[data-space="France"]');
el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
```

Load a scenario through the real Import path. Run this from the setup screen; press `Menu` first if a game is open.

```js
const name = 'amphibious';
const text = await (await fetch(`/.verify/scenarios/${name}.json`)).text();
const input = document.querySelector('input[type=file]');
const dt = new DataTransfer();
dt.items.add(new File([text], `${name}.json`, { type: 'application/json' }));
input.files = dt.files;
input.dispatchEvent(new Event('change', { bubbles: true }));
```

Read the game state. The autosave is written on every change, so this is a second, independent view of what the UI shows.

```js
const saved = JSON.parse(localStorage.getItem('aa1942.session.v1'));
const s = saved.state;
({ round: s.round, power: s.power, phase: s.phase, pending: s.pending, treasury: s.treasury, battles: s.battles.map((b) => [b.space, b.kind, b.resolved, b.winner]), log: s.log.slice(-8) })
```

Screenshots can show the frame before the last click. Before trusting a screenshot, wait one second or confirm the state with the snippet above. Keep `javascript_tool` scripts under about 30 seconds; split longer waits across calls. Bring the tab to the front with `tabs_select` before timed waits, because a hidden pane throttles the AI timers.

## Evidence

Write each run's proof to `.verify/evidence/<YYYYMMDD-HHMM>-<feature-id>/`. The folder is gitignored and cleanup never touches it.

- `steps.md` lists each user action taken, its entry point, and the observed result.
- `state-before.json` and `state-after.json` hold the state-snippet output, written there with the Write tool.
- `*.jpg` are screenshots. The screenshot tool result names the file it saved, so copy that file into the folder with `cp`.

Proof standards:

- Drive the player's path: buttons, territory clicks and Import. Never call engine functions or edit `localStorage` to make progress, except for the read-only state snippet.
- Record the action and the resulting state, not only the final screen. For rules, record the dice the battle dialog shows, since `battle.dice` is the authority.
- Check side effects in the state as well as on screen: owner changes, treasury, unit positions and the log.
- If an entry point cannot be reached, report it as unverified with the attempted step. Never count another entry point as proof of it.

## Cleanup

- Stop only the server this run started: `preview_stop` with the `serverId` from `preview_start`.
- Reset the viewport with `resize_window` and `preset: "desktop"`.
- To clear test games from the browser, press `Menu`. The autosave stays and is overwritten by the next game; to remove it, run `localStorage.removeItem('aa1942.session.v1')`.
- Scenario files in `.verify/scenarios` are cheap to regenerate and can stay. Never delete `.verify/evidence`.

## Helpers

- `npx tsx scripts/verify/scenario.ts <name> [--ai Germans,Japanese]` writes a save file for a named position. `--ai` hands those powers to the computer; every other power is human.
- `scripts/verify/doctor.sh` checks the instance. Use `PORT=5174 scripts/verify/doctor.sh` for another port.
