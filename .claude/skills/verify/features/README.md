# Axis & Allies 1942 verification map

This directory is the maintained source for verifying what a player can do in the game. Read this index first, then use the matching feature file as the recipe.

## Baseline preconditions

- Run the dev server from this checkout at `http://localhost:5173`, started by this run with `preview_start` and `name: "game"`.
- Set the viewport to 1440 by 900. The map opens at zoom 1.35.
- `scripts/verify/doctor.sh` must print `DOCTOR OK` for this checkout.
- Generate the scenario each recipe names with `npx tsx scripts/verify/scenario.ts <name>`.
- Never drive a server or a saved game this run did not create.

## Driving conventions

- Start each recipe from the setup screen. Press `Menu`, then `Main menu` if a game is open.
- Prefer button text, `data-space` territory handles and `data-stack` piece handles over screen coordinates. Drags need coordinates taken from those handles.
- Load positions only through the `Import saved game…` path, using the snippet in SKILL.md.
- Use territory and sea zone names exactly as they appear in `src/data/map.json`.
- Read state only with the read-only snippet in SKILL.md. Never write state to make progress.

## Proof and skip reporting

- Capture the player action and the resulting state, not only the final screen.
- UI proof is a screenshot plus the state snippet output, both stored in the run's evidence folder.
- Rules proof quotes the battle dialog dice or `battle.dice` along with the outcome.
- Record the feature ID and entry point with every artifact.
- Report an unreachable entry point with the step you tried and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph on the player-visible behavior. It then has four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with the browser pane`, and `Gotchas`. Keep implementation detail out. Name only player paths, stable handles, required state and observable proof.

## Features

- [Setup and saves](./setup-and-saves.md) covers new games, options, continue, import and export.
- [Purchase](./purchase.md) covers the purchase tray, the production limit and factory repair.
- [Movement](./movement.md) covers dragging and picking up pieces, moving, blitzing, loading, offloading and undo.
- [Combat](./combat.md) covers battle order, the battle dialog and every battle decision.
- [Mobilize and income](./mobilize-and-income.md) covers placing units from the tray, ending a turn, income and victory.
- [AI turns](./ai-turns.md) covers computer-controlled powers and handing decisions to human defenders.
- [Turn flow and guidance](./turn-flow.md) covers the turn card, hint line, odds tags, end-phase warnings, the menu, log and help.
- [Online play](./online-play.md) covers rooms by link, seats, live moves across browsers and cross-player battles.
