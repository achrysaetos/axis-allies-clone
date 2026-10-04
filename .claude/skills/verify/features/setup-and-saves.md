# Setup and saves

A player starts a new game with a human or AI per power and chooses the victory condition and optional rules. The game autosaves after every action, can be resumed with Continue, and can be exported to or imported from a JSON file.

## Sub-features

- `setup-new` starts a game from the printed 1942 setup with the chosen controllers and options.
- `setup-options` sets total victory, the Turkish straits closure and raid escorts and interceptors.
- `setup-continue` resumes the autosaved game after a reload.
- `setup-import` loads a saved game file.
- `setup-export` downloads the current game as a JSON file.

## How to get to it (user POV)

- Open the app with no game in progress, or press `Menu` in a game.
- Choose `Human` or `AI` per power, tick the option checkboxes, then press `Start new game`.
- Press the `Continue: round N, Power` button on the setup screen.
- Choose a file with `Import saved game…`.
- Press `Export` in the top bar during a game.

## Driving it with the browser pane

Preconditions:

- The server is healthy and `.verify/scenarios/opening.json` exists.

- **New game.** Press `Start new game` (`find` "Start new game", then click its ref). The top bar reads `Round 1`, `Russians` and `Purchase`, with `24 IPC +24` and `Axis 6/9 · Allies 7/10`.
- **Options.** On the setup screen, tick `Bombing raid escorts and interceptors` and `Total (13 cities)`, then press `Start new game`. The state snippet shows `options.sbrEscortsInterceptors: true` and `options.victory: "total"`, and the top bar threshold reads `/13`.
- **Continue.** Make one purchase, reload the page, then press `Continue: round 1, Russians`. The purchase panel shows the same purchase.
- **Import.** Press `Menu`, then run the Import snippet with `opening`. The game opens at `Round 1`, `Russians`, `Purchase`.
- **Export.** Press `Export`. The browser starts a download named `aa1942-round1-Russians.json`. Downloads need the user's permission, so record this as unverified unless they allow it.

## Gotchas

- The setup screen keeps the previous choices, so set every controller explicitly.
- The `Human` and `AI` toggles are separate buttons per power, and scripted rapid clicks can miss. Confirm the controllers in `saved.controllers` before starting.
- Reloading resumes nothing by itself. The player must press `Continue`.
